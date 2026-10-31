/* =====================================================================================
   03_Phase3_Pareto.sql
   Phase 3 : Pareto chart goes live.
             No new tables — Pareto reports use RPT_Dataset / RPT_Report from Phase 1
             and keep their settings in RPT_Report.Config_Json.

   Run after 02_Phase2_Box_Plot.sql. Safe to re-run.
   Database : PQ_Quality_Tools
   ===================================================================================== */

USE [PQ_Quality_Tools]
GO

/* -------------------------------------------------------------------------------------
   1. Enable the chart type (the API only creates reports for available chart types)
   ------------------------------------------------------------------------------------- */
UPDATE [dbo].[RPT_Chart_Type]
SET    [Is_Available] = 1,
       [Description]  = N'Ranked bars with cumulative % line to find the vital few (80/20 rule).'
WHERE  [Chart_Type_Code] = N'PARETO'
GO

/* -------------------------------------------------------------------------------------
   2. Menu shortcut under "Reports" (opens My Reports filtered to Pareto)
   ------------------------------------------------------------------------------------- */
DECLARE @ReportsMenuID numeric(18, 0) = (SELECT TOP 1 [Menu_ID] FROM [dbo].[MM_Menus] WHERE [ActionName] = N'Reports')

IF @ReportsMenuID IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM [dbo].[MM_Sub_Menus] WHERE [ActionName] = N'reports/pareto')
    INSERT INTO [dbo].[MM_Sub_Menus] ([ActionName], [LinkName], [Menu_ID], [Inserted_Date], [Is_Edited], [Sort_Order], [Is_Active], [Audit_Type_Id])
    VALUES (N'reports/pareto', N'Pareto Chart', @ReportsMenuID, GETDATE(), 0, 4, 1, 1)

-- keep the chart shortcuts in chart order: Fishbone, Box Plot, Pareto, Histogram
UPDATE [dbo].[MM_Sub_Menus] SET [Sort_Order] = 5 WHERE [ActionName] = N'reports/histogram'
GO
