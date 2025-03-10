import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoService } from '../../../services/video/video.service';

interface Detection {
  class: string;
  confidence: number;
  bbox: number[];
}

interface Alert {
  id: string;
  class: string;
  confidence: number;
  image: string;
  timestamp: Date;
}

@Component({
  selector: 'app-video-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="video-upload-container">
      <h2>Analyse de fichier vidéo</h2>
      
      <div class="upload-controls">
        <input 
          type="file" 
          #fileInput 
          accept="video/*" 
          (change)="onFileSelected($event)"
          [disabled]="isProcessing"
        >
        <span *ngIf="selectedFile">{{ selectedFile.name }}</span>
      </div>
      
      <div class="video-container">
        <video 
          #videoElement 
          [width]="WIDTH" 
          [height]="HEIGHT" 
          controls
          [hidden]="isProcessing"
        ></video>
        <canvas #canvasElement [width]="WIDTH" [height]="HEIGHT" hidden></canvas>
      </div>
      
      <div class="progress-container" *ngIf="isProcessing">
        <div class="progress-bar" [style.width.%]="progressPercentage"></div>
        <span>{{ progressPercentage.toFixed(1) }}% - {{ currentFrame }} / {{ totalFrames }} images traitées</span>
      </div>
      
      <div class="controls">
        <button 
          class="btn primary" 
          (click)="processVideo()" 
          [disabled]="!selectedFile || isProcessing"
        >
          Démarrer l'analyse
        </button>
        <button 
          class="btn danger" 
          (click)="stopProcessing()" 
          [disabled]="!isProcessing"
        >
          Arrêter l'analyse
        </button>
      </div>
      
      <div class="detection-stats" *ngIf="detectionSummary.length > 0">
        <h3>Résumé des détections</h3>
        <ul>
          <li *ngFor="let stat of detectionSummary">
            {{ stat.class }}: {{ stat.count }} détections (confiance moyenne: {{ stat.avgConfidence.toFixed(1) }}%)
          </li>
        </ul>
      </div>
      
      <div class="alerts-section" *ngIf="alerts.length > 0">
        <h3>Détections importantes ({{ alerts.length }})</h3>
        <div class="alerts-container">
          <div class="alert-card" *ngFor="let alert of alerts">
            <div class="alert-header">
              <span class="alert-timestamp">{{ formatTimestamp(alert.timestamp) }}</span>
              <div class="alert-badge">{{ alert.class }} - {{ alert.confidence }}%</div>
            </div>
            
            <div class="alert-image">
              <img [src]="alert.image" alt="Détection d'arme">
            </div>
            
            <div class="alert-actions">
              <button class="btn small primary" (click)="downloadImage(alert)">Télécharger</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .video-upload-container {
      padding: 1rem;
    }
    
    .upload-controls {
      margin-bottom: 1rem;
    }
    
    .video-container {
      margin-bottom: 1rem;
      background: #000;
    }
    
    .progress-container {
      height: 2rem;
      background: #f0f0f0;
      border-radius: 4px;
      margin: 1rem 0;
      position: relative;
      overflow: hidden;
    }
    
    .progress-bar {
      height: 100%;
      background: #007bff;
      transition: width 0.3s ease;
    }
    
    .progress-container span {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #333;
      font-weight: bold;
    }
    
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .detection-stats {
      margin-top: 1rem;
      padding: 1rem;
      background: #f9f9f9;
      border-radius: 4px;
    }
    
    .alerts-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .alert-card {
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .alert-header {
      padding: 0.5rem;
      background: #f5f5f5;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .alert-badge {
      background: #dc3545;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    
    .alert-image img {
      width: 100%;
      height: auto;
    }
    
    .alert-actions {
      padding: 0.5rem;
      display: flex;
      justify-content: flex-end;
    }
  `]
})
export class VideoUploadComponent implements OnDestroy {
  WIDTH = 640;
  HEIGHT = 480;
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  
  selectedFile: File | null = null;
  isProcessing = false;
  shouldStopProcessing = false;
  progressPercentage = 0;
  currentFrame = 0;
  totalFrames = 0;
  frameRate = 0;
  
  detections: Detection[] = [];
  alerts: Alert[] = [];
  detectionSummary: { class: string, count: number, avgConfidence: number }[] = [];
  
  // Paramètres pour réduire la fréquence de traitement et éviter les alertes multiples
  private processingInterval = 1000; // Analyser une image par seconde
  private lastAlertTime = 0;
  private alertCooldown = 5000; // 5 secondes entre les alertes
  private confidenceThreshold = 40; // Seuil de confiance minimum
  
  constructor(private videoService: VideoService) {}
  
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      
      // Charger la vidéo pour obtenir sa durée et autres métadonnées
      const videoURL = URL.createObjectURL(this.selectedFile);
      this.videoElement.nativeElement.src = videoURL;
      
      // Réinitialiser les détections et alertes
      this.detections = [];
      this.alerts = [];
      this.detectionSummary = [];
      this.progressPercentage = 0;
      this.currentFrame = 0;
      
      // Calculer le nombre total d'images à traiter
      this.videoElement.nativeElement.onloadedmetadata = () => {
        const duration = this.videoElement.nativeElement.duration;
        this.frameRate = this.videoElement.nativeElement.videoWidth > 1280 ? 2 : 1; // Ajuster la fréquence d'échantillonnage selon la résolution
        this.totalFrames = Math.ceil(duration / (this.processingInterval / 1000));
      };
    }
  }
  
  async processVideo() {
    if (!this.selectedFile) return;
    
    this.isProcessing = true;
    this.shouldStopProcessing = false;
    this.progressPercentage = 0;
    this.currentFrame = 0;
    
    // Réinitialiser la position de la vidéo
    this.videoElement.nativeElement.currentTime = 0;
    
    // Créer un canvas pour extraire les images
    const context = this.canvasElement.nativeElement.getContext('2d');
    
    if (!context) {
      console.error("Impossible d'obtenir le contexte de canvas");
      this.isProcessing = false;
      return;
    }
    
    // Attendre que la vidéo soit prête
    await new Promise(resolve => {
      this.videoElement.nativeElement.onloadeddata = resolve;
      this.videoElement.nativeElement.load();
    });
    
    // Stocker les statistiques de détection
    const detectionStats: { [key: string]: { count: number, totalConfidence: number } } = {};
    
    // Fonction pour traiter une image à un moment précis
    const processFrame = async (timestamp: number): Promise<boolean> => {
      if (this.shouldStopProcessing) {
        return false;
      }
      
      // Positionner la vidéo au timestamp
      this.videoElement.nativeElement.currentTime = timestamp;
      
      // Attendre que la vidéo soit à la position demandée
      await new Promise(resolve => {
        const seeked = () => {
          this.videoElement.nativeElement.removeEventListener('seeked', seeked);
          resolve(undefined);
        };
        this.videoElement.nativeElement.addEventListener('seeked', seeked);
      });
      
      // Dessiner l'image sur le canvas
      context.drawImage(
        this.videoElement.nativeElement, 
        0, 0, 
        this.WIDTH, this.HEIGHT
      );
      
      // Convertir l'image en base64
      const imageData = this.canvasElement.nativeElement.toDataURL('image/png');
      
      // Envoyer l'image pour traitement
      return new Promise<boolean>(resolve => {
        this.videoService.processFrame(imageData).subscribe({
          next: (response) => {
            if (response.success) {
              // Mettre à jour les détections
              this.detections = response.detections;
              
              // Mettre à jour les statistiques
              for (const detection of this.detections) {
                if (!detectionStats[detection.class]) {
                  detectionStats[detection.class] = { count: 0, totalConfidence: 0 };
                }
                detectionStats[detection.class].count++;
                detectionStats[detection.class].totalConfidence += detection.confidence;
              }
              
              // Vérifier s'il y a des détections d'armes
              const weaponDetections = this.detections.filter(
                d => d.class === 'Gun' && d.confidence > this.confidenceThreshold
              );
              
              if (weaponDetections.length > 0 && this.canTriggerAlert()) {
                this.triggerAlert(weaponDetections[0], response.processed_image, timestamp);
              }
              
              resolve(true);
            } else {
              resolve(false);
            }
          },
          error: (error) => {
            console.error("Erreur d'envoi d'image:", error);
            resolve(false);
          }
        });
      });
    };
    
    // Traiter la vidéo image par image
    const duration = this.videoElement.nativeElement.duration;
    const interval = this.processingInterval / 1000; // Convertir en secondes
    
    for (let time = 0; time < duration; time += interval) {
      this.currentFrame++;
      
      // Mettre à jour la progression
      this.progressPercentage = (time / duration) * 100;
      
      // Traiter l'image
      const success = await processFrame(time);
      
      if (!success || this.shouldStopProcessing) {
        break;
      }
      
      // Petite pause pour éviter de surcharger le navigateur
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Calculer et afficher le résumé des détections
    this.detectionSummary = Object.entries(detectionStats).map(([className, stats]) => ({
      class: className,
      count: stats.count,
      avgConfidence: stats.totalConfidence / stats.count
    }));
    
    // Terminer le traitement
    this.progressPercentage = 100;
    this.isProcessing = false;
  }
  
  stopProcessing() {
    this.shouldStopProcessing = true;
  }
  
  // Éviter les alertes multiples trop rapprochées
  canTriggerAlert(): boolean {
    const now = Date.now();
    if (now - this.lastAlertTime > this.alertCooldown) {
      this.lastAlertTime = now;
      return true;
    }
    return false;
  }
  
  triggerAlert(detection: Detection, processedImage: string, timestamp: number) {
    // Créer une alerte
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      class: detection.class,
      confidence: detection.confidence,
      image: processedImage,
      timestamp: new Date(this.videoElement.nativeElement.currentTime * 1000)
    };
    
    // Ajouter l'alerte au début de la liste
    this.alerts.unshift(alert);
  }
  
  downloadImage(alert: Alert) {
    const link = document.createElement('a');
    link.href = alert.image;
    link.download = `detection-${alert.timestamp.toISOString().replace(/:/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  formatTimestamp(date: Date): string {
    const totalSeconds = Math.floor(this.videoElement.nativeElement.currentTime);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  ngOnDestroy() {
    this.stopProcessing();
    
    // Libérer la mémoire
    if (this.selectedFile) {
      URL.revokeObjectURL(this.videoElement.nativeElement.src);
    }
  }
}