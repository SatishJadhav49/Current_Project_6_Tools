using API_PQ_Quality_Tools.Models.DTOs;
using Microsoft.Data.SqlClient;
using System.Data;
using System.Text.Json;

namespace API_PQ_Quality_Tools.Data
{
    public class RPT_ReportDataService
    {
        private readonly IDbConnectionFactory _connectionFactory;

        // Shared SELECT for list + detail. @Employee_ID decides ownership / share access.
        private const string ReportSelect = @"
            SELECT
                r.Report_ID, r.Report_Name, r.Description, r.Chart_Type_Code, ct.Chart_Type_Name,
                r.Dataset_ID, d.Dataset_Name, r.Owner_Employee_ID, e.Employee_Name AS Owner_Name,
                r.Inserted_Date, r.Updated_Date,
                (SELECT COUNT(1) FROM RPT_Report_Share s WHERE s.Report_ID = r.Report_ID) AS Share_Count,
                CAST(CASE WHEN r.Owner_Employee_ID = @Employee_ID THEN 1 ELSE 0 END AS bit) AS Is_Owner,
                CAST(CASE WHEN r.Owner_Employee_ID = @Employee_ID THEN 1 ELSE ISNULL(sh.Can_Edit, 0) END AS bit) AS Can_Edit
                {0}
            FROM RPT_Report r
            INNER JOIN RPT_Chart_Type ct ON ct.Chart_Type_Code = r.Chart_Type_Code
            INNER JOIN RPT_Dataset d ON d.Dataset_ID = r.Dataset_ID
            INNER JOIN MM_Employee e ON e.Employee_ID = r.Owner_Employee_ID
            LEFT JOIN RPT_Report_Share sh ON sh.Report_ID = r.Report_ID AND sh.Employee_ID = @Employee_ID
            WHERE r.Is_Deleted = 0
              AND (r.Owner_Employee_ID = @Employee_ID OR sh.Share_ID IS NOT NULL)";

        public RPT_ReportDataService(IDbConnectionFactory connectionFactory)
        {
            _connectionFactory = connectionFactory;
        }

        public async Task<List<RPT_ChartTypeDto>> GetChartTypes()
        {
            const string query = @"
                SELECT Chart_Type_ID, Chart_Type_Code, Chart_Type_Name, Description, Sort_Order, Is_Available
                FROM RPT_Chart_Type
                WHERE Is_Active = 1
                ORDER BY Sort_Order";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            var chartTypes = new List<RPT_ChartTypeDto>();
            while (await reader.ReadAsync())
            {
                chartTypes.Add(new RPT_ChartTypeDto
                {
                    Chart_Type_ID = Convert.ToDecimal(reader["Chart_Type_ID"]),
                    Chart_Type_Code = reader["Chart_Type_Code"]?.ToString() ?? string.Empty,
                    Chart_Type_Name = reader["Chart_Type_Name"]?.ToString() ?? string.Empty,
                    Description = reader["Description"] != DBNull.Value ? reader["Description"].ToString()! : string.Empty,
                    Sort_Order = Convert.ToInt32(reader["Sort_Order"]),
                    Is_Available = Convert.ToBoolean(reader["Is_Available"])
                });
            }
            return chartTypes;
        }

        /// <summary>Reports owned by the user plus reports shared with the user (Is_Owner tells them apart).</summary>
        public async Task<List<RPT_ReportListDto>> GetReportList(decimal employeeId)
        {
            var query = string.Format(ReportSelect, string.Empty) + " ORDER BY ISNULL(r.Updated_Date, r.Inserted_Date) DESC";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            using var reader = await command.ExecuteReaderAsync();

            var reports = new List<RPT_ReportListDto>();
            while (await reader.ReadAsync())
            {
                var item = new RPT_ReportListDto();
                MapListColumns(reader, item);
                reports.Add(item);
            }
            return reports;
        }

        /// <summary>Report + its dataset rows. Returns null when the user has no access.</summary>
        public async Task<RPT_ReportDetailDto?> GetReportById(decimal reportId, decimal employeeId)
        {
            var query = string.Format(ReportSelect, ", r.Config_Json, d.Columns_Json, d.Rows_Json") + " AND r.Report_ID = @Report_ID";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            command.Parameters.Add(new SqlParameter("@Report_ID", reportId));
            using var reader = await command.ExecuteReaderAsync();

            if (!await reader.ReadAsync()) return null;

            var item = new RPT_ReportDetailDto
            {
                Config_Json = reader["Config_Json"] != DBNull.Value ? reader["Config_Json"].ToString()! : "{}",
                Columns_Json = reader["Columns_Json"]?.ToString() ?? "[]",
                Rows_Json = reader["Rows_Json"]?.ToString() ?? "[]"
            };
            MapListColumns(reader, item);
            return item;
        }

        public async Task<decimal> CreateReport(RPT_ReportCreateDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Report_Name))
                throw new ArgumentException("Report name is required.");
            ValidateConfig(dto.Config_Json);

            using var connection = await _connectionFactory.CreateConnectionAsync();

            // Dataset must belong to the user and the chart type must be live
            const string checkQuery = @"
                SELECT
                    (SELECT COUNT(1) FROM RPT_Dataset WHERE Dataset_ID = @Dataset_ID AND Owner_Employee_ID = @Employee_ID AND Is_Deleted = 0) AS DatasetOk,
                    (SELECT COUNT(1) FROM RPT_Chart_Type WHERE Chart_Type_Code = @Chart_Type_Code AND Is_Available = 1 AND Is_Active = 1) AS ChartOk";
            using (var check = new SqlCommand(checkQuery, connection))
            {
                check.Parameters.Add(new SqlParameter("@Dataset_ID", dto.Dataset_ID));
                check.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
                check.Parameters.Add(new SqlParameter("@Chart_Type_Code", dto.Chart_Type_Code));
                using var reader = await check.ExecuteReaderAsync();
                await reader.ReadAsync();
                if (Convert.ToInt32(reader["DatasetOk"]) == 0) throw new ArgumentException("Dataset not found.");
                if (Convert.ToInt32(reader["ChartOk"]) == 0) throw new ArgumentException("This chart type is not available yet.");
            }

            const string query = @"
                INSERT INTO RPT_Report
                (Report_Name, Description, Chart_Type_Code, Dataset_ID, Config_Json, Owner_Employee_ID, Plant_ID,
                 Is_Deleted, Inserted_User_ID, Inserted_Host, Inserted_Date)
                OUTPUT INSERTED.Report_ID
                VALUES
                (@Report_Name, @Description, @Chart_Type_Code, @Dataset_ID, @Config_Json, @Employee_ID, @Plant_ID,
                 0, @Employee_ID, @Host, @Date)";

            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Report_Name", dto.Report_Name.Trim()));
            command.Parameters.Add(new SqlParameter("@Description", dto.Description ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Chart_Type_Code", dto.Chart_Type_Code));
            command.Parameters.Add(new SqlParameter("@Dataset_ID", dto.Dataset_ID));
            command.Parameters.Add(new SqlParameter("@Config_Json", SqlDbType.NVarChar, -1) { Value = dto.Config_Json ?? "{}" });
            command.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
            command.Parameters.Add(new SqlParameter("@Plant_ID", dto.Plant_ID ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Host", dto.Host ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Date", DateTime.Now));

            return Convert.ToDecimal(await command.ExecuteScalarAsync());
        }

        /// <summary>Owner or a user shared with edit rights can update name / description / config.</summary>
        public async Task<bool> UpdateReport(decimal reportId, RPT_ReportUpdateDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Report_Name))
                throw new ArgumentException("Report name is required.");
            ValidateConfig(dto.Config_Json);

            const string query = @"
                UPDATE r SET
                    Report_Name = @Report_Name,
                    Description = @Description,
                    Config_Json = @Config_Json,
                    Updated_User_ID = @Employee_ID,
                    Updated_Host = @Host,
                    Updated_Date = @Date
                FROM RPT_Report r
                LEFT JOIN RPT_Report_Share sh ON sh.Report_ID = r.Report_ID AND sh.Employee_ID = @Employee_ID
                WHERE r.Report_ID = @Report_ID AND r.Is_Deleted = 0
                  AND (r.Owner_Employee_ID = @Employee_ID OR sh.Can_Edit = 1)";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Report_ID", reportId));
            command.Parameters.Add(new SqlParameter("@Report_Name", dto.Report_Name.Trim()));
            command.Parameters.Add(new SqlParameter("@Description", dto.Description ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Config_Json", SqlDbType.NVarChar, -1) { Value = dto.Config_Json ?? "{}" });
            command.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
            command.Parameters.Add(new SqlParameter("@Host", dto.Host ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Date", DateTime.Now));

            return await command.ExecuteNonQueryAsync() > 0;
        }

        /// <summary>Soft delete by owner only; shares are removed with it.</summary>
        public async Task<bool> DeleteReport(decimal reportId, decimal employeeId)
        {
            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var transaction = connection.BeginTransaction();
            try
            {
                const string query = @"
                    UPDATE RPT_Report SET Is_Deleted = 1, Updated_User_ID = @Employee_ID, Updated_Date = @Date
                    WHERE Report_ID = @Report_ID AND Owner_Employee_ID = @Employee_ID AND Is_Deleted = 0";
                using var command = new SqlCommand(query, connection, transaction);
                command.Parameters.Add(new SqlParameter("@Report_ID", reportId));
                command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
                command.Parameters.Add(new SqlParameter("@Date", DateTime.Now));

                if (await command.ExecuteNonQueryAsync() == 0)
                {
                    transaction.Rollback();
                    return false;
                }

                using var shareCommand = new SqlCommand("DELETE FROM RPT_Report_Share WHERE Report_ID = @Report_ID", connection, transaction);
                shareCommand.Parameters.Add(new SqlParameter("@Report_ID", reportId));
                await shareCommand.ExecuteNonQueryAsync();

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        //********************************************** Sharing **********************************************//
        public async Task<List<RPT_ReportShareDto>> GetReportShares(decimal reportId, decimal employeeId)
        {
            const string query = @"
                SELECT sh.Employee_ID, e.Employee_Name, e.Employee_No, sh.Can_Edit
                FROM RPT_Report_Share sh
                INNER JOIN RPT_Report r ON r.Report_ID = sh.Report_ID
                INNER JOIN MM_Employee e ON e.Employee_ID = sh.Employee_ID
                WHERE sh.Report_ID = @Report_ID AND r.Owner_Employee_ID = @Employee_ID
                ORDER BY e.Employee_Name";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Report_ID", reportId));
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            using var reader = await command.ExecuteReaderAsync();

            var shares = new List<RPT_ReportShareDto>();
            while (await reader.ReadAsync())
            {
                shares.Add(new RPT_ReportShareDto
                {
                    Employee_ID = Convert.ToDecimal(reader["Employee_ID"]),
                    Employee_Name = reader["Employee_Name"]?.ToString() ?? string.Empty,
                    Employee_No = reader["Employee_No"]?.ToString() ?? string.Empty,
                    Can_Edit = Convert.ToBoolean(reader["Can_Edit"])
                });
            }
            return shares;
        }

        /// <summary>Replaces the full share list of a report (owner only).</summary>
        public async Task<bool> SaveReportShares(RPT_ReportShareSaveDto dto)
        {
            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var transaction = connection.BeginTransaction();
            try
            {
                const string ownerQuery = "SELECT COUNT(1) FROM RPT_Report WHERE Report_ID = @Report_ID AND Owner_Employee_ID = @Employee_ID AND Is_Deleted = 0";
                using (var ownerCommand = new SqlCommand(ownerQuery, connection, transaction))
                {
                    ownerCommand.Parameters.Add(new SqlParameter("@Report_ID", dto.Report_ID));
                    ownerCommand.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
                    if (Convert.ToInt32(await ownerCommand.ExecuteScalarAsync()) == 0)
                    {
                        transaction.Rollback();
                        return false;
                    }
                }

                using (var deleteCommand = new SqlCommand("DELETE FROM RPT_Report_Share WHERE Report_ID = @Report_ID", connection, transaction))
                {
                    deleteCommand.Parameters.Add(new SqlParameter("@Report_ID", dto.Report_ID));
                    await deleteCommand.ExecuteNonQueryAsync();
                }

                const string insertQuery = @"
                    INSERT INTO RPT_Report_Share (Report_ID, Employee_ID, Can_Edit, Inserted_User_ID, Inserted_Host, Inserted_Date)
                    VALUES (@Report_ID, @Share_Employee_ID, @Can_Edit, @Employee_ID, @Host, @Date)";

                // owner never shares with self; duplicates collapse to the last entry
                var shares = dto.Shares
                    .Where(s => s.Employee_ID != dto.Employee_ID)
                    .GroupBy(s => s.Employee_ID)
                    .Select(g => g.Last());

                foreach (var share in shares)
                {
                    using var insertCommand = new SqlCommand(insertQuery, connection, transaction);
                    insertCommand.Parameters.Add(new SqlParameter("@Report_ID", dto.Report_ID));
                    insertCommand.Parameters.Add(new SqlParameter("@Share_Employee_ID", share.Employee_ID));
                    insertCommand.Parameters.Add(new SqlParameter("@Can_Edit", share.Can_Edit));
                    insertCommand.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
                    insertCommand.Parameters.Add(new SqlParameter("@Host", dto.Host ?? (object)DBNull.Value));
                    insertCommand.Parameters.Add(new SqlParameter("@Date", DateTime.Now));
                    await insertCommand.ExecuteNonQueryAsync();
                }

                transaction.Commit();
                return true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }

        //********************************************** Helpers **********************************************//
        private static void ValidateConfig(string? configJson)
        {
            if (string.IsNullOrWhiteSpace(configJson)) return;
            using var config = JsonDocument.Parse(configJson);
            if (config.RootElement.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("Report config must be a JSON object.");
        }

        private static void MapListColumns(SqlDataReader reader, RPT_ReportListDto item)
        {
            item.Report_ID = Convert.ToDecimal(reader["Report_ID"]);
            item.Report_Name = reader["Report_Name"]?.ToString() ?? string.Empty;
            item.Description = reader["Description"] != DBNull.Value ? reader["Description"].ToString()! : string.Empty;
            item.Chart_Type_Code = reader["Chart_Type_Code"]?.ToString() ?? string.Empty;
            item.Chart_Type_Name = reader["Chart_Type_Name"]?.ToString() ?? string.Empty;
            item.Dataset_ID = Convert.ToDecimal(reader["Dataset_ID"]);
            item.Dataset_Name = reader["Dataset_Name"]?.ToString() ?? string.Empty;
            item.Owner_Employee_ID = Convert.ToDecimal(reader["Owner_Employee_ID"]);
            item.Owner_Name = reader["Owner_Name"]?.ToString() ?? string.Empty;
            item.Share_Count = Convert.ToInt32(reader["Share_Count"]);
            item.Is_Owner = Convert.ToBoolean(reader["Is_Owner"]);
            item.Can_Edit = Convert.ToBoolean(reader["Can_Edit"]);
            item.Inserted_Date = reader["Inserted_Date"] != DBNull.Value ? Convert.ToDateTime(reader["Inserted_Date"]) : null;
            item.Updated_Date = reader["Updated_Date"] != DBNull.Value ? Convert.ToDateTime(reader["Updated_Date"]) : null;
        }
    }
}
