using API_PQ_Quality_Tools.Data;
using API_PQ_Quality_Tools.Models.DTOs;
using API_PQ_Quality_Tools.Utils;
using Microsoft.AspNetCore.Mvc;

namespace API_PQ_Quality_Tools.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RPT_ReportController : BaseController
    {
        private readonly RPT_ReportDataService _reportDataService;

        public RPT_ReportController(
            RPT_ReportDataService reportDataService,
            IApiResponseHelper responseHelper,
            MM_ErrorLogDataService errorLogService)
            : base(responseHelper, errorLogService)
        {
            _reportDataService = reportDataService;
        }

        [HttpGet("GetChartTypes")]
        public async Task<IActionResult> GetChartTypes()
        {
            try
            {
                var result = await _reportDataService.GetChartTypes();
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Chart types retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetChartTypes");
            }
        }

        [HttpGet("GetReportList/{employeeId}")]
        public async Task<IActionResult> GetReportList(decimal employeeId)
        {
            try
            {
                var result = await _reportDataService.GetReportList(employeeId);
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Reports retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetReportList");
            }
        }

        [HttpGet("GetReportById/{reportId}/{employeeId}")]
        public async Task<IActionResult> GetReportById(decimal reportId, decimal employeeId)
        {
            try
            {
                var result = await _reportDataService.GetReportById(reportId, employeeId);
                if (result == null)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Report not found or you do not have access to it."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Report retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetReportById");
            }
        }

        [HttpPost("CreateReport")]
        public async Task<IActionResult> CreateReport([FromBody] RPT_ReportCreateDto dto)
        {
            try
            {
                var reportId = await _reportDataService.CreateReport(dto);
                return Ok(_responseHelper.CreateSuccessResponse(reportId, "Success", "Report created successfully"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(_responseHelper.CreateValidationErrorResponse(Constants.Messages.VALIDATION_ERROR, ex.Message));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "CreateReport");
            }
        }

        [HttpPost("UpdateReport/{reportId}")]
        public async Task<IActionResult> UpdateReport(decimal reportId, [FromBody] RPT_ReportUpdateDto dto)
        {
            try
            {
                var updated = await _reportDataService.UpdateReport(reportId, dto);
                if (!updated)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Report not found or you do not have edit access."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(reportId, "Success", "Report saved successfully"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(_responseHelper.CreateValidationErrorResponse(Constants.Messages.VALIDATION_ERROR, ex.Message));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "UpdateReport");
            }
        }

        [HttpPost("DeleteReport")]
        public async Task<IActionResult> DeleteReport([FromBody] RPT_DeleteRequestDto dto)
        {
            try
            {
                var deleted = await _reportDataService.DeleteReport(dto.ID, dto.Employee_ID);
                if (!deleted)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Only the report owner can delete this report."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(true, "Success", "Report deleted successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "DeleteReport");
            }
        }

        [HttpGet("GetReportShares/{reportId}/{employeeId}")]
        public async Task<IActionResult> GetReportShares(decimal reportId, decimal employeeId)
        {
            try
            {
                var result = await _reportDataService.GetReportShares(reportId, employeeId);
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Report shares retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetReportShares");
            }
        }

        [HttpPost("SaveReportShares")]
        public async Task<IActionResult> SaveReportShares([FromBody] RPT_ReportShareSaveDto dto)
        {
            try
            {
                var saved = await _reportDataService.SaveReportShares(dto);
                if (!saved)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Only the report owner can change sharing."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(true, "Success", "Report sharing updated"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "SaveReportShares");
            }
        }
    }
}
