namespace API_PQ_Quality_Tools.Models.DTOs
{
    //********************************************** Chart Type **********************************************//
    public class RPT_ChartTypeDto
    {
        public decimal Chart_Type_ID { get; set; }
        public string Chart_Type_Code { get; set; } = String.Empty;
        public string Chart_Type_Name { get; set; } = String.Empty;
        public string Description { get; set; } = String.Empty;
        public int Sort_Order { get; set; }
        public bool Is_Available { get; set; }
    }

    //********************************************** Dataset **********************************************//
    public class RPT_DatasetListDto
    {
        public decimal Dataset_ID { get; set; }
        public string Dataset_Name { get; set; } = String.Empty;
        public string Description { get; set; } = String.Empty;
        public string Source_Type { get; set; } = String.Empty;
        public string Source_File_Name { get; set; } = String.Empty;
        public int Row_Count { get; set; }
        public int Column_Count { get; set; }
        public int Report_Count { get; set; }
        public decimal Owner_Employee_ID { get; set; }
        public DateTime? Inserted_Date { get; set; }
        public DateTime? Updated_Date { get; set; }
    }

    public class RPT_DatasetDetailDto : RPT_DatasetListDto
    {
        // Raw JSON strings — the UI owns the shape, the API only validates + stores them
        public string Columns_Json { get; set; } = "[]";
        public string Rows_Json { get; set; } = "[]";
    }

    public class RPT_DatasetSaveDto
    {
        public string Dataset_Name { get; set; } = String.Empty;
        public string? Description { get; set; }
        public string Source_Type { get; set; } = "MANUAL";
        public string? Source_File_Name { get; set; }
        public string Columns_Json { get; set; } = "[]";
        public string Rows_Json { get; set; } = "[]";
        public decimal Employee_ID { get; set; }
        public decimal? Plant_ID { get; set; }
        public string? Host { get; set; }
    }

    public class RPT_DeleteRequestDto
    {
        public decimal ID { get; set; }
        public decimal Employee_ID { get; set; }
    }

    //********************************************** Report **********************************************//
    public class RPT_ReportListDto
    {
        public decimal Report_ID { get; set; }
        public string Report_Name { get; set; } = String.Empty;
        public string Description { get; set; } = String.Empty;
        public string Chart_Type_Code { get; set; } = String.Empty;
        public string Chart_Type_Name { get; set; } = String.Empty;
        public decimal Dataset_ID { get; set; }
        public string Dataset_Name { get; set; } = String.Empty;
        public decimal Owner_Employee_ID { get; set; }
        public string Owner_Name { get; set; } = String.Empty;
        public int Share_Count { get; set; }
        public bool Is_Owner { get; set; }
        public bool Can_Edit { get; set; }
        public DateTime? Inserted_Date { get; set; }
        public DateTime? Updated_Date { get; set; }
    }

    public class RPT_ReportDetailDto : RPT_ReportListDto
    {
        public string Config_Json { get; set; } = "{}";
        public string Columns_Json { get; set; } = "[]";
        public string Rows_Json { get; set; } = "[]";
    }

    public class RPT_ReportCreateDto
    {
        public string Report_Name { get; set; } = String.Empty;
        public string? Description { get; set; }
        public string Chart_Type_Code { get; set; } = String.Empty;
        public decimal Dataset_ID { get; set; }
        public string? Config_Json { get; set; }
        public decimal Employee_ID { get; set; }
        public decimal? Plant_ID { get; set; }
        public string? Host { get; set; }
    }

    public class RPT_ReportUpdateDto
    {
        public string Report_Name { get; set; } = String.Empty;
        public string? Description { get; set; }
        public string? Config_Json { get; set; }
        public decimal Employee_ID { get; set; }
        public string? Host { get; set; }
    }

    //********************************************** Share **********************************************//
    public class RPT_ReportShareDto
    {
        public decimal Employee_ID { get; set; }
        public string Employee_Name { get; set; } = String.Empty;
        public string Employee_No { get; set; } = String.Empty;
        public bool Can_Edit { get; set; }
    }

    public class RPT_ReportShareSaveDto
    {
        public decimal Report_ID { get; set; }
        public decimal Employee_ID { get; set; } // the owner performing the change
        public string? Host { get; set; }
        public List<RPT_ReportShareDto> Shares { get; set; } = new();
    }
}
