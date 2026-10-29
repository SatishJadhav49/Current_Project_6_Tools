using API_PQ_Quality_Tools.Data;
using API_PQ_Quality_Tools.Models.DTOs;
using API_PQ_Quality_Tools.Utils;
using Microsoft.AspNetCore.Mvc;

namespace API_PQ_Quality_Tools.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RPT_DatasetController : BaseController
    {
        private readonly RPT_DatasetDataService _datasetDataService;

        public RPT_DatasetController(
            RPT_DatasetDataService datasetDataService,
            IApiResponseHelper responseHelper,
            MM_ErrorLogDataService errorLogService)
            : base(responseHelper, errorLogService)
        {
            _datasetDataService = datasetDataService;
        }

        [HttpGet("GetDatasetList/{employeeId}")]
        public async Task<IActionResult> GetDatasetList(decimal employeeId)
        {
            try
            {
                var result = await _datasetDataService.GetDatasetList(employeeId);
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Datasets retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetDatasetList");
            }
        }

        [HttpGet("GetDatasetById/{datasetId}/{employeeId}")]
        public async Task<IActionResult> GetDatasetById(decimal datasetId, decimal employeeId)
        {
            try
            {
                var result = await _datasetDataService.GetDatasetById(datasetId, employeeId);
                if (result == null)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Dataset not found or you do not have access to it."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(result, "Success", "Dataset retrieved successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "GetDatasetById");
            }
        }

        [HttpPost("CreateDataset")]
        public async Task<IActionResult> CreateDataset([FromBody] RPT_DatasetSaveDto dto)
        {
            try
            {
                var datasetId = await _datasetDataService.CreateDataset(dto);
                return Ok(_responseHelper.CreateSuccessResponse(datasetId, "Success", "Dataset saved successfully"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(_responseHelper.CreateValidationErrorResponse(Constants.Messages.VALIDATION_ERROR, ex.Message));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "CreateDataset");
            }
        }

        [HttpPost("UpdateDataset/{datasetId}")]
        public async Task<IActionResult> UpdateDataset(decimal datasetId, [FromBody] RPT_DatasetSaveDto dto)
        {
            try
            {
                var updated = await _datasetDataService.UpdateDataset(datasetId, dto);
                if (!updated)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Dataset not found or you do not have access to it."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(datasetId, "Success", "Dataset updated successfully"));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(_responseHelper.CreateValidationErrorResponse(Constants.Messages.VALIDATION_ERROR, ex.Message));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "UpdateDataset");
            }
        }

        [HttpPost("DeleteDataset")]
        public async Task<IActionResult> DeleteDataset([FromBody] RPT_DeleteRequestDto dto)
        {
            try
            {
                var reportCount = await _datasetDataService.GetReportCount(dto.ID);
                if (reportCount > 0)
                {
                    return Ok(_responseHelper.CreateAlertResponse<object>(
                        "Dataset In Use",
                        $"{reportCount} report(s) are built on this dataset. Delete those reports first."));
                }

                var deleted = await _datasetDataService.DeleteDataset(dto.ID, dto.Employee_ID);
                if (!deleted)
                {
                    return NotFound(_responseHelper.CreateErrorResponse<object>(Constants.Messages.NOT_FOUND, "Dataset not found or you do not have access to it."));
                }
                return Ok(_responseHelper.CreateSuccessResponse(true, "Success", "Dataset deleted successfully"));
            }
            catch (Exception ex)
            {
                return await HandleExceptionAsync(ex, "DeleteDataset");
            }
        }
    }
}
