//********************************************** Dataset **********************************************//
export type ColumnType = 'text' | 'number' | 'date';
export type CellValue = string | number | null;
export type DatasetSourceType = 'MANUAL' | 'EXCEL' | 'CSV';

export interface DatasetColumn {
  key: string; // stable id (c1, c2...) — rows are keyed by this, so renaming a column is safe
  name: string;
  type: ColumnType;
}

export type DatasetRow = Record<string, CellValue>;

export interface DatasetSummary {
  Dataset_ID: number;
  Dataset_Name: string;
  Description: string;
  Source_Type: DatasetSourceType;
  Source_File_Name: string;
  Row_Count: number;
  Column_Count: number;
  Report_Count: number;
  Owner_Employee_ID: number;
  Inserted_Date: string | null;
  Updated_Date: string | null;
}

export interface DatasetDetail extends DatasetSummary {
  Columns_Json: string;
  Rows_Json: string;
}

export interface DatasetSaveRequest {
  Dataset_Name: string;
  Description: string;
  Source_Type: DatasetSourceType;
  Source_File_Name: string | null;
  Columns_Json: string;
  Rows_Json: string;
  Employee_ID: number;
  Plant_ID: number | null;
  Host: string;
}

//********************************************** Report **********************************************//
export interface ChartTypeInfo {
  Chart_Type_ID: number;
  Chart_Type_Code: string;
  Chart_Type_Name: string;
  Description: string;
  Sort_Order: number;
  Is_Available: boolean;
}

export interface ReportSummary {
  Report_ID: number;
  Report_Name: string;
  Description: string;
  Chart_Type_Code: string;
  Chart_Type_Name: string;
  Dataset_ID: number;
  Dataset_Name: string;
  Owner_Employee_ID: number;
  Owner_Name: string;
  Share_Count: number;
  Is_Owner: boolean;
  Can_Edit: boolean;
  Inserted_Date: string | null;
  Updated_Date: string | null;
}

export interface ReportDetail extends ReportSummary {
  Config_Json: string;
  Columns_Json: string;
  Rows_Json: string;
}

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isEmpty'
  | 'isNotEmpty';

export interface ReportFilter {
  columnKey: string;
  operator: FilterOperator;
  value: string;
}

/** Saved in RPT_Report.Config_Json. `chart` is owned by the chart type component. */
export interface ReportConfig<TChart = any> {
  filters: ReportFilter[];
  chart: TChart;
}

export interface ReportCreateRequest {
  Report_Name: string;
  Description: string;
  Chart_Type_Code: string;
  Dataset_ID: number;
  Config_Json: string;
  Employee_ID: number;
  Plant_ID: number | null;
  Host: string;
}

export interface ReportUpdateRequest {
  Report_Name: string;
  Description: string;
  Config_Json: string;
  Employee_ID: number;
  Host: string;
}

//********************************************** Share **********************************************//
export interface ReportShare {
  Employee_ID: number;
  Employee_Name: string;
  Employee_No: string;
  Can_Edit: boolean;
}

export interface EmployeeOption {
  Employee_ID: number;
  Employee_Name: string;
  Employee_No: string;
}
