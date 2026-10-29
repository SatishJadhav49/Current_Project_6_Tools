using API_PQ_Quality_Tools.Models.DTOs;
using Microsoft.Data.SqlClient;
using System.Data;
using System.Text.Json;

namespace API_PQ_Quality_Tools.Data
{
    public class RPT_DatasetDataService
    {
        private readonly IDbConnectionFactory _connectionFactory;

        public static readonly string[] SourceTypes = { "MANUAL", "EXCEL", "CSV" };

        public RPT_DatasetDataService(IDbConnectionFactory connectionFactory)
        {
            _connectionFactory = connectionFactory;
        }

        public async Task<List<RPT_DatasetListDto>> GetDatasetList(decimal employeeId)
        {
            const string query = @"
                SELECT
                    d.Dataset_ID, d.Dataset_Name, d.Description, d.Source_Type, d.Source_File_Name,
                    d.Row_Count, d.Column_Count, d.Owner_Employee_ID, d.Inserted_Date, d.Updated_Date,
                    (SELECT COUNT(1) FROM RPT_Report r WHERE r.Dataset_ID = d.Dataset_ID AND r.Is_Deleted = 0) AS Report_Count
                FROM RPT_Dataset d
                WHERE d.Owner_Employee_ID = @Employee_ID AND d.Is_Deleted = 0
                ORDER BY ISNULL(d.Updated_Date, d.Inserted_Date) DESC";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            using var reader = await command.ExecuteReaderAsync();

            var datasets = new List<RPT_DatasetListDto>();
            while (await reader.ReadAsync())
            {
                var item = new RPT_DatasetListDto();
                MapListColumns(reader, item);
                datasets.Add(item);
            }
            return datasets;
        }

        public async Task<RPT_DatasetDetailDto?> GetDatasetById(decimal datasetId, decimal employeeId)
        {
            const string query = @"
                SELECT
                    d.Dataset_ID, d.Dataset_Name, d.Description, d.Source_Type, d.Source_File_Name,
                    d.Row_Count, d.Column_Count, d.Owner_Employee_ID, d.Inserted_Date, d.Updated_Date,
                    d.Columns_Json, d.Rows_Json,
                    (SELECT COUNT(1) FROM RPT_Report r WHERE r.Dataset_ID = d.Dataset_ID AND r.Is_Deleted = 0) AS Report_Count
                FROM RPT_Dataset d
                WHERE d.Dataset_ID = @Dataset_ID AND d.Owner_Employee_ID = @Employee_ID AND d.Is_Deleted = 0";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Dataset_ID", datasetId));
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            using var reader = await command.ExecuteReaderAsync();

            if (!await reader.ReadAsync()) return null;

            var item = new RPT_DatasetDetailDto
            {
                Columns_Json = reader["Columns_Json"]?.ToString() ?? "[]",
                Rows_Json = reader["Rows_Json"]?.ToString() ?? "[]"
            };
            MapListColumns(reader, item);
            return item;
        }

        public async Task<decimal> CreateDataset(RPT_DatasetSaveDto dto)
        {
            var (rowCount, columnCount) = ValidateAndCount(dto);

            const string query = @"
                INSERT INTO RPT_Dataset
                (Dataset_Name, Description, Source_Type, Source_File_Name, Columns_Json, Rows_Json, Row_Count, Column_Count,
                 Owner_Employee_ID, Plant_ID, Is_Deleted, Inserted_User_ID, Inserted_Host, Inserted_Date)
                OUTPUT INSERTED.Dataset_ID
                VALUES
                (@Dataset_Name, @Description, @Source_Type, @Source_File_Name, @Columns_Json, @Rows_Json, @Row_Count, @Column_Count,
                 @Employee_ID, @Plant_ID, 0, @Employee_ID, @Host, @Date)";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            AddSaveParameters(command, dto, rowCount, columnCount);
            command.Parameters.Add(new SqlParameter("@Plant_ID", dto.Plant_ID ?? (object)DBNull.Value));

            return Convert.ToDecimal(await command.ExecuteScalarAsync());
        }

        public async Task<bool> UpdateDataset(decimal datasetId, RPT_DatasetSaveDto dto)
        {
            var (rowCount, columnCount) = ValidateAndCount(dto);

            const string query = @"
                UPDATE RPT_Dataset SET
                    Dataset_Name = @Dataset_Name,
                    Description = @Description,
                    Source_Type = @Source_Type,
                    Source_File_Name = @Source_File_Name,
                    Columns_Json = @Columns_Json,
                    Rows_Json = @Rows_Json,
                    Row_Count = @Row_Count,
                    Column_Count = @Column_Count,
                    Updated_User_ID = @Employee_ID,
                    Updated_Host = @Host,
                    Updated_Date = @Date
                WHERE Dataset_ID = @Dataset_ID AND Owner_Employee_ID = @Employee_ID AND Is_Deleted = 0";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            AddSaveParameters(command, dto, rowCount, columnCount);
            command.Parameters.Add(new SqlParameter("@Dataset_ID", datasetId));

            return await command.ExecuteNonQueryAsync() > 0;
        }

        /// <summary>Number of live reports built on this dataset (delete is blocked while > 0).</summary>
        public async Task<int> GetReportCount(decimal datasetId)
        {
            const string query = "SELECT COUNT(1) FROM RPT_Report WHERE Dataset_ID = @Dataset_ID AND Is_Deleted = 0";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Dataset_ID", datasetId));
            return Convert.ToInt32(await command.ExecuteScalarAsync());
        }

        public async Task<bool> DeleteDataset(decimal datasetId, decimal employeeId)
        {
            const string query = @"
                UPDATE RPT_Dataset SET Is_Deleted = 1, Updated_User_ID = @Employee_ID, Updated_Date = @Date
                WHERE Dataset_ID = @Dataset_ID AND Owner_Employee_ID = @Employee_ID AND Is_Deleted = 0";

            using var connection = await _connectionFactory.CreateConnectionAsync();
            using var command = new SqlCommand(query, connection);
            command.Parameters.Add(new SqlParameter("@Dataset_ID", datasetId));
            command.Parameters.Add(new SqlParameter("@Employee_ID", employeeId));
            command.Parameters.Add(new SqlParameter("@Date", DateTime.Now));

            return await command.ExecuteNonQueryAsync() > 0;
        }

        //********************************************** Helpers **********************************************//
        private static (int rowCount, int columnCount) ValidateAndCount(RPT_DatasetSaveDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Dataset_Name))
                throw new ArgumentException("Dataset name is required.");
            if (!SourceTypes.Contains(dto.Source_Type))
                throw new ArgumentException("Invalid source type.");

            using var columns = JsonDocument.Parse(dto.Columns_Json);
            using var rows = JsonDocument.Parse(dto.Rows_Json);
            if (columns.RootElement.ValueKind != JsonValueKind.Array || rows.RootElement.ValueKind != JsonValueKind.Array)
                throw new ArgumentException("Columns and rows must be JSON arrays.");

            return (rows.RootElement.GetArrayLength(), columns.RootElement.GetArrayLength());
        }

        private static void AddSaveParameters(SqlCommand command, RPT_DatasetSaveDto dto, int rowCount, int columnCount)
        {
            command.Parameters.Add(new SqlParameter("@Dataset_Name", dto.Dataset_Name.Trim()));
            command.Parameters.Add(new SqlParameter("@Description", dto.Description ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Source_Type", dto.Source_Type));
            command.Parameters.Add(new SqlParameter("@Source_File_Name", dto.Source_File_Name ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Columns_Json", SqlDbType.NVarChar, -1) { Value = dto.Columns_Json });
            command.Parameters.Add(new SqlParameter("@Rows_Json", SqlDbType.NVarChar, -1) { Value = dto.Rows_Json });
            command.Parameters.Add(new SqlParameter("@Row_Count", rowCount));
            command.Parameters.Add(new SqlParameter("@Column_Count", columnCount));
            command.Parameters.Add(new SqlParameter("@Employee_ID", dto.Employee_ID));
            command.Parameters.Add(new SqlParameter("@Host", dto.Host ?? (object)DBNull.Value));
            command.Parameters.Add(new SqlParameter("@Date", DateTime.Now));
        }

        private static void MapListColumns(SqlDataReader reader, RPT_DatasetListDto item)
        {
            item.Dataset_ID = Convert.ToDecimal(reader["Dataset_ID"]);
            item.Dataset_Name = reader["Dataset_Name"]?.ToString() ?? string.Empty;
            item.Description = reader["Description"] != DBNull.Value ? reader["Description"].ToString()! : string.Empty;
            item.Source_Type = reader["Source_Type"]?.ToString() ?? string.Empty;
            item.Source_File_Name = reader["Source_File_Name"] != DBNull.Value ? reader["Source_File_Name"].ToString()! : string.Empty;
            item.Row_Count = Convert.ToInt32(reader["Row_Count"]);
            item.Column_Count = Convert.ToInt32(reader["Column_Count"]);
            item.Report_Count = Convert.ToInt32(reader["Report_Count"]);
            item.Owner_Employee_ID = Convert.ToDecimal(reader["Owner_Employee_ID"]);
            item.Inserted_Date = reader["Inserted_Date"] != DBNull.Value ? Convert.ToDateTime(reader["Inserted_Date"]) : null;
            item.Updated_Date = reader["Updated_Date"] != DBNull.Value ? Convert.ToDateTime(reader["Updated_Date"]) : null;
        }
    }
}
