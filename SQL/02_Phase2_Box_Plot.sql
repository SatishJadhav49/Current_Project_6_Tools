/* =====================================================================================
   02_Phase2_Box_Plot.sql
   Phase 2 : Box Plot chart goes live.
             No new tables — Box Plot reports use RPT_Dataset / RPT_Report from Phase 1
             and keep their settings in RPT_Report.Config_Json.

   Run after 01_Phase1_Report_Builder.sql. Safe to re-run.
   Database : PQ_Quality_Tools
   ===================================================================================== */

USE [PQ_Quality_Tools]
GO

/* -------------------------------------------------------------------------------------
   1. Enable the chart type (the API only creates reports for available chart types)
   ------------------------------------------------------------------------------------- */
UPDATE [dbo].[RPT_Chart_Type]
SET    [Is_Available] = 1,
       [Description]  = N'Spread, median and outliers of a measure by year, quarter, month or any column.'
WHERE  [Chart_Type_Code] = N'BOX_PLOT'
GO

/* -------------------------------------------------------------------------------------
   2. Menu shortcut under "Reports" (opens My Reports filtered to Box Plot)
   ------------------------------------------------------------------------------------- */
DECLARE @ReportsMenuID numeric(18, 0) = (SELECT TOP 1 [Menu_ID] FROM [dbo].[MM_Menus] WHERE [ActionName] = N'Reports')

IF @ReportsMenuID IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM [dbo].[MM_Sub_Menus] WHERE [ActionName] = N'reports/boxplot')
    INSERT INTO [dbo].[MM_Sub_Menus] ([ActionName], [LinkName], [Menu_ID], [Inserted_Date], [Is_Edited], [Sort_Order], [Is_Active], [Audit_Type_Id])
    VALUES (N'reports/boxplot', N'Box Plot', @ReportsMenuID, GETDATE(), 0, 3, 1, 1)
GO
