import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';


export interface ProcessResponse {
  success: boolean;
  detections: {
    class: string;
    confidence: number;
    bbox: number[];
  }[];
  processed_image: string;
  timestamp: string;
  processing_time_ms?: number;
  error?: string;
}
@Injectable({
  providedIn: 'root'
})
export class VideoService {
  private readonly apiUrl = 'http://localhost:5000';

  constructor(private readonly http: HttpClient) { }


  processFrame(imageData: string, source: 'webcam' | 'video' = 'webcam'): Observable<ProcessResponse> {
    return this.http.post<ProcessResponse>(`${this.apiUrl}/stream`, {
      image: imageData,
      source: source
    });
  }
}