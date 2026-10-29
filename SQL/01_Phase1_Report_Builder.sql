/* =====================================================================================
   01_Phase1_Report_Builder.sql
   Phase 1 : User datasets (Excel / CSV / Manual) + user reports + report sharing
             + chart type master (Fishbone live, others planned) + menu entries.

   Safe to re-run: every object is created only when it does not already exist.
   Database : PQ_Quality_Tools
   ===================================================================================== */

USE [PQ_Quality_Tools]
GO

/* -------------------------------------------------------------------------------------
   1. Chart type master — drives the "New Report" picker. Add a row + a UI component
      to enable a new chart in future phases (set Is_Available = 1 when it is built).
   ------------------------------------------------------------------------------------- */
IF OBJECT_ID(N'[dbo].[RPT_Chart_Type]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RPT_Chart_Type](
        [Chart_Type_ID]   [numeric](18, 0) IDENTITY(1,1) NOT NULL,
        [Chart_Type_Code] [varchar](30)    NOT NULL,
        [Chart_Type_Name] [nvarchar](100)  NOT NULL,
        [Description]     [nvarchar](500)  NULL,
        [Sort_Order]      [int]            NOT NULL CONSTRAINT [DF_RPT_Chart_Type_Sort_Order] DEFAULT (0),
        [Is_Available]    [bit]            NOT NULL CONSTRAINT [DF_RPT_Chart_Type_Is_Available] DEFAULT (0),
        [Is_Active]       [bit]            NOT NULL CONSTRAINT [DF_RPT_Chart_Type_Is_Active] DEFAULT (1),
        [Inserted_Date]   [datetime]       NULL CONSTRAINT [DF_RPT_Chart_Type_Inserted_Date] DEFAULT (GETDATE()),
        CONSTRAINT [PK_RPT_Chart_Type] PRIMARY KEY CLUSTERED ([Chart_Type_ID] ASC),
        CONSTRAINT [UQ_RPT_Chart_Type_Code] UNIQUE ([Chart_Type_Code])
    ) ON [PRIMARY]
END
GO

MERGE [dbo].[RPT_Chart_Type] AS target
USING (VALUES
    ('FISHBONE',       N'Fishbone',              N'Ishikawa cause & effect diagram grouped by category.', 1, 1),
    ('BOX_PLOT',       N'Box Plot',              N'Spread, median and outliers of a numeric measure.',     2, 0),
    ('PARETO',         N'Pareto Chart',          N'Ranked bars with cumulative % (80/20 rule).',           3, 0),
    ('HISTOGRAM',      N'Histogram',             N'Frequency distribution of a numeric measure.',          4, 0),
    ('CONTROL_CHART',  N'Control Chart',         N'Process values against UCL / CL / LCL over time.',      5, 0),
    ('SCATTER',        N'Scatter Diagram',       N'Relationship between two numeric measures.',            6, 0),
    ('STRATIFICATION', N'Stratification',        N'Split data into groups to reveal hidden patterns.',     7, 0),
    ('FAULT_TREE',     N'Fault Tree Analysis',   N'Top-down logic tree of failure events.',                8, 0)
) AS source ([Chart_Type_Code], [Chart_Type_Name], [Description], [Sort_Order], [Is_Available])
ON target.[Chart_Type_Code] = source.[Chart_Type_Code]
WHEN NOT MATCHED THEN
    INSERT ([Chart_Type_Code], [Chart_Type_Name], [Description], [Sort_Order], [Is_Available])
    VALUES (source.[Chart_Type_Code], source.[Chart_Type_Name], source.[Description], source.[Sort_Order], source.[Is_Available]);
GO

/* -------------------------------------------------------------------------------------
   2. Dataset — one named dataset per use case, owned by a user.
      Columns_Json : [{ "key":"c1", "name":"Category", "type":"text|number|date" }, ...]
      Rows_Json    : [{ "c1":"Man", "c2":"Operator not trained" }, ...]
   ------------------------------------------------------------------------------------- */
IF OBJECT_ID(N'[dbo].[RPT_Dataset]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RPT_Dataset](
        [Dataset_ID]        [numeric](18, 0) IDENTITY(1,1) NOT NULL,
        [Dataset_Name]      [nvarchar](150)  NOT NULL,
        [Description]       [nvarchar](500)  NULL,
        [Source_Type]       [varchar](20)    NOT NULL,   -- MANUAL | EXCEL | CSV
        [Source_File_Name]  [nvarchar](260)  NULL,
        [Columns_Json]      [nvarchar](max)  NOT NULL,
        [Rows_Json]         [nvarchar](max)  NOT NULL,
        [Row_Count]         [int]            NOT NULL CONSTRAINT [DF_RPT_Dataset_Row_Count] DEFAULT (0),
        [Column_Count]      [int]            NOT NULL CONSTRAINT [DF_RPT_Dataset_Column_Count] DEFAULT (0),
        [Owner_Employee_ID] [decimal](18, 0) NOT NULL,
        [Plant_ID]          [numeric](18, 0) NULL,
        [Is_Deleted]        [bit]            NOT NULL CONSTRAINT [DF_RPT_Dataset_Is_Deleted] DEFAULT (0),
        [Inserted_User_ID]  [numeric](18, 0) NULL,
        [Inserted_Host]     [nvarchar](100)  NULL,
        [Inserted_Date]     [datetime]       NULL,
        [Updated_User_ID]   [numeric](18, 0) NULL,
        [Updated_Host]      [nvarchar](100)  NULL,
        [Updated_Date]      [datetime]       NULL,
        CONSTRAINT [PK_RPT_Dataset] PRIMARY KEY CLUSTERED ([Dataset_ID] ASC),
        CONSTRAINT [CK_RPT_Dataset_Source_Type] CHECK ([Source_Type] IN ('MANUAL', 'EXCEL', 'CSV')),
        CONSTRAINT [FK_RPT_Dataset_MM_Employee] FOREIGN KEY ([Owner_Employee_ID]) REFERENCES [dbo].[MM_Employee] ([Employee_ID])
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]

    CREATE NONCLUSTERED INDEX [IX_RPT_Dataset_Owner] ON [dbo].[RPT_Dataset] ([Owner_Employee_ID], [Is_Deleted])
END
GO

/* -------------------------------------------------------------------------------------
   3. Report — a chart built on a dataset. Many reports can use the same dataset.
      Config_Json : { "filters":[...], "chart":{ chart-type specific settings } }
   ------------------------------------------------------------------------------------- */
IF OBJECT_ID(N'[dbo].[RPT_Report]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RPT_Report](
        [Report_ID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
        [Report_Name]       [nvarchar](150)  NOT NULL,
        [Description]       [nvarchar](500)  NULL,
        [Chart_Type_Code]   [varchar](30)    NOT NULL,
        [Dataset_ID]        [numeric](18, 0) NOT NULL,
        [Config_Json]       [nvarchar](max)  NULL,
        [Owner_Employee_ID] [decimal](18, 0) NOT NULL,
        [Plant_ID]          [numeric](18, 0) NULL,
        [Is_Deleted]        [bit]            NOT NULL CONSTRAINT [DF_RPT_Report_Is_Deleted] DEFAULT (0),
        [Inserted_User_ID]  [numeric](18, 0) NULL,
        [Inserted_Host]     [nvarchar](100)  NULL,
        [Inserted_Date]     [datetime]       NULL,
        [Updated_User_ID]   [numeric](18, 0) NULL,
        [Updated_Host]      [nvarchar](100)  NULL,
        [Updated_Date]      [datetime]       NULL,
        CONSTRAINT [PK_RPT_Report] PRIMARY KEY CLUSTERED ([Report_ID] ASC),
        CONSTRAINT [FK_RPT_Report_RPT_Dataset] FOREIGN KEY ([Dataset_ID]) REFERENCES [dbo].[RPT_Dataset] ([Dataset_ID]),
        CONSTRAINT [FK_RPT_Report_RPT_Chart_Type] FOREIGN KEY ([Chart_Type_Code]) REFERENCES [dbo].[RPT_Chart_Type] ([Chart_Type_Code]),
        CONSTRAINT [FK_RPT_Report_MM_Employee] FOREIGN KEY ([Owner_Employee_ID]) REFERENCES [dbo].[MM_Employee] ([Employee_ID])
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]

    CREATE NONCLUSTERED INDEX [IX_RPT_Report_Owner] ON [dbo].[RPT_Report] ([Owner_Employee_ID], [Is_Deleted])
    CREATE NONCLUSTERED INDEX [IX_RPT_Report_Dataset] ON [dbo].[RPT_Report] ([Dataset_ID])
END
GO

/* -------------------------------------------------------------------------------------
   4. Report share — owner gives specific users View or Edit access to a report.
   ------------------------------------------------------------------------------------- */
IF OBJECT_ID(N'[dbo].[RPT_Report_Share]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RPT_Report_Share](
        [Share_ID]         [numeric](18, 0) IDENTITY(1,1) NOT NULL,
        [Report_ID]        [numeric](18, 0) NOT NULL,
        [Employee_ID]      [decimal](18, 0) NOT NULL,
        [Can_Edit]         [bit]            NOT NULL CONSTRAINT [DF_RPT_Report_Share_Can_Edit] DEFAULT (0),
        [Inserted_User_ID] [numeric](18, 0) NULL,
        [Inserted_Host]    [nvarchar](100)  NULL,
        [Inserted_Date]    [datetime]       NULL,
        CONSTRAINT [PK_RPT_Report_Share] PRIMARY KEY CLUSTERED ([Share_ID] ASC),
        CONSTRAINT [UQ_RPT_Report_Share] UNIQUE ([Report_ID], [Employee_ID]),
        CONSTRAINT [FK_RPT_Report_Share_RPT_Report] FOREIGN KEY ([Report_ID]) REFERENCES [dbo].[RPT_Report] ([Report_ID]),
        CONSTRAINT [FK_RPT_Report_Share_MM_Employee] FOREIGN KEY ([Employee_ID]) REFERENCES [dbo].[MM_Employee] ([Employee_ID])
    ) ON [PRIMARY]

    CREATE NONCLUSTERED INDEX [IX_RPT_Report_Share_Employee] ON [dbo].[RPT_Report_Share] ([Employee_ID])
END
GO

/* -------------------------------------------------------------------------------------
   5. Menu entries under "Reports" (Menu_ID = 2).
      Sub menus are picked up for every role mapped to the menu in MM_Menu_Role.
      Existing entries reports/fishbone, reports/boxplot, reports/histogram stay as they are.
   ------------------------------------------------------------------------------------- */
DECLARE @ReportsMenuID numeric(18, 0) = (SELECT TOP 1 [Menu_ID] FROM [dbo].[MM_Menus] WHERE [ActionName] = N'Reports')

IF @ReportsMenuID IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM [dbo].[MM_Sub_Menus] WHERE [ActionName] = N'reports/myreports')
        INSERT INTO [dbo].[MM_Sub_Menus] ([ActionName], [LinkName], [Menu_ID], [Inserted_Date], [Is_Edited], [Sort_Order], [Is_Active], [Audit_Type_Id])
        VALUES (N'reports/myreports', N'My Reports', @ReportsMenuID, GETDATE(), 0, 0, 1, 1)

    IF NOT EXISTS (SELECT 1 FROM [dbo].[MM_Sub_Menus] WHERE [ActionName] = N'reports/datasets')
        INSERT INTO [dbo].[MM_Sub_Menus] ([ActionName], [LinkName], [Menu_ID], [Inserted_Date], [Is_Edited], [Sort_Order], [Is_Active], [Audit_Type_Id])
        VALUES (N'reports/datasets', N'My Datasets', @ReportsMenuID, GETDATE(), 0, 0, 1, 1)

    -- keep the chart shortcuts after the two main pages
    UPDATE [dbo].[MM_Sub_Menus] SET [Sort_Order] = 1 WHERE [ActionName] = N'reports/datasets'
    UPDATE [dbo].[MM_Sub_Menus] SET [Sort_Order] = 2 WHERE [ActionName] = N'reports/fishbone'
    UPDATE [dbo].[MM_Sub_Menus] SET [Sort_Order] = 3 WHERE [ActionName] = N'reports/boxplot'
    UPDATE [dbo].[MM_Sub_Menus] SET [Sort_Order] = 4 WHERE [ActionName] = N'reports/histogram'
END
GO
