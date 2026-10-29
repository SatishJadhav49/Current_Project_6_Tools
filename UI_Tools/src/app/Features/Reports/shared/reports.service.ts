import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiRequestService } from '../../../services/api-request.service';
import {
  ChartTypeInfo,
  DatasetDetail,
  DatasetSaveRequest,
  DatasetSummary,
  EmployeeOption,
  ReportCreateRequest,
  ReportDetail,
  ReportShare,
  ReportSummary,
  ReportUpdateRequest,
} from './report.models';

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  readonly apiRequest = inject(ApiRequestService);

  //********************************************** Current User **********************************************//
  get employeeId(): number {
    return Number(localStorage.getItem('Employee_ID') || 0);
  }

  get plantId(): number | null {
    const plantId = Number(localStorage.getItem('Plant_ID'));
    return plantId || null;
  }

  get host(): string {
    return localStorage.getItem('Hostname') || '';
  }

  //********************************************** Datasets **********************************************//
  getDatasetList(): Observable<DatasetSummary[]> {
    return this.apiRequest.get(`RPT_Dataset/GetDatasetList/${this.employeeId}`);
  }

  getDatasetById(datasetId: number): Observable<DatasetDetail> {
    return this.apiRequest.get(`RPT_Dataset/GetDatasetById/${datasetId}/${this.employeeId}`);
  }

  /** Returns the new Dataset_ID */
  createDataset(dataset: DatasetSaveRequest): Observable<number> {
    return this.apiRequest.postForGet('RPT_Dataset/CreateDataset', dataset);
  }

  updateDataset(datasetId: number, dataset: DatasetSaveRequest): Observable<number> {
    return this.apiRequest.postForGet(`RPT_Dataset/UpdateDataset/${datasetId}`, dataset);
  }

  /** Returns the response flags — isAlertMessage is set when reports still use the dataset */
  deleteDataset(datasetId: number): Observable<any> {
    return this.apiRequest.post('RPT_Dataset/DeleteDataset', { ID: datasetId, Employee_ID: this.employeeId });
  }

  //********************************************** Reports **********************************************//
  getChartTypes(): Observable<ChartTypeInfo[]> {
    return this.apiRequest.get('RPT_Report/GetChartTypes');
  }

  /** My reports + reports shared with me (Is_Owner tells them apart) */
  getReportList(): Observable<ReportSummary[]> {
    return this.apiRequest.get(`RPT_Report/GetReportList/${this.employeeId}`);
  }

  getReportById(reportId: number): Observable<ReportDetail> {
    return this.apiRequest.get(`RPT_Report/GetReportById/${reportId}/${this.employeeId}`);
  }

  /** Returns the new Report_ID */
  createReport(report: ReportCreateRequest): Observable<number> {
    return this.apiRequest.postForGet('RPT_Report/CreateReport', report);
  }

  updateReport(reportId: number, report: ReportUpdateRequest): Observable<number> {
    return this.apiRequest.postForGet(`RPT_Report/UpdateReport/${reportId}`, report);
  }

  deleteReport(reportId: number): Observable<any> {
    return this.apiRequest.post('RPT_Report/DeleteReport', { ID: reportId, Employee_ID: this.employeeId });
  }

  //********************************************** Sharing **********************************************//
  getReportShares(reportId: number): Observable<ReportShare[]> {
    return this.apiRequest.get(`RPT_Report/GetReportShares/${reportId}/${this.employeeId}`);
  }

  saveReportShares(reportId: number, shares: ReportShare[]): Observable<any> {
    return this.apiRequest.post('RPT_Report/SaveReportShares', {
      Report_ID: reportId,
      Employee_ID: this.employeeId,
      Host: this.host,
      Shares: shares,
    });
  }

  getEmployees(): Observable<EmployeeOption[]> {
    return this.apiRequest.get('MM_EmployeeMaster/GetAllEmployees');
  }
}
