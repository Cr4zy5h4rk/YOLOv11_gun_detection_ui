import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  selector: 'app-video',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video.component.html',
  styleUrl: './video.component.scss'
})
export class VideoComponent implements AfterViewInit, OnDestroy {
  WIDTH = 640;
  HEIGHT = 480;

  @ViewChild("video") video!: ElementRef;
  @ViewChild("canvas") canvas!: ElementRef;
  @ViewChild("alertSound") alertSound!: ElementRef;
  
  private stream!: MediaStream;
  private interval!: any;
  
  detections: Detection[] = [];
  alerts: Alert[] = [];
  isStreaming: boolean = false;
  isMuted: boolean = false;
  
  // Paramètres pour éviter les alertes multiples
  private lastAlertTime: number = 0;
  private alertCooldown: number = 5000; // 5 secondes entre les alertes

  constructor(private videoService : VideoService) {}

  async ngAfterViewInit() {
    await this.setupDevices();
  }

  async setupDevices() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.video.nativeElement.srcObject = this.stream;
      this.video.nativeElement.play();
    } catch (e) {
      console.error("Erreur d'accès à la caméra:", e);
    }
  }

  startStreaming() {
    this.isStreaming = true;
    this.interval = setInterval(() => {
      this.captureFrame();
    }, 1000); // Capture toutes les secondes
  }

  stopStreaming() {
    this.isStreaming = false;
    clearInterval(this.interval);
  }

  captureFrame() {
    const context = this.canvas.nativeElement.getContext("2d");
    context.drawImage(this.video.nativeElement, 0, 0, this.WIDTH, this.HEIGHT);

    const imageData = this.canvas.nativeElement.toDataURL("image/png");

    this.videoService.processFrame(imageData).subscribe({
      next: (response) => {
        if (response.success) {
          // Mettre à jour les détections
          this.detections = response.detections;
          
          // Vérifier s'il y a des détections d'armes
          const weaponDetections = this.detections.filter(d => d.class === 'Gun' && d.confidence > 40);
          
          if (weaponDetections.length > 0 && this.canTriggerAlert()) {
            this.triggerAlert(weaponDetections[0], response.processed_image);
          }
        }
      },
      error: (error) => {
        console.error("Erreur d'envoi d'image:", error);
      },
      complete: () => {
        // Optional: handle completion event
      }
    });
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
  
  triggerAlert(detection: Detection, processedImage: string) {
    // Jouer le son d'alerte si non muet
    if (!this.isMuted) {
      this.alertSound.nativeElement.play();
    }
    
    // Créer une alerte
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      class: detection.class,
      confidence: detection.confidence,
      image: processedImage,
      timestamp: new Date()
    };
    
    // Ajouter l'alerte au début de la liste
    this.alerts.unshift(alert);
  }
  
  dismissAlert(alert: Alert) {
    this.alerts = this.alerts.filter(a => a.id !== alert.id);
  }
  
  dismissAllAlerts() {
    this.alerts = [];
  }
  
  contactAuthorities() {
    const message = `Alerte de sécurité: ${this.alerts.length} détection(s) d'arme`;
    alert(message + "\nContact des forces de l'ordre en cours...");
    // Ici vous pourriez implémenter un vrai appel API pour contacter les autorités
  }
  
  toggleMute() {
    this.isMuted = !this.isMuted;
  }
  
  downloadImage(alert: Alert) {
    const link = document.createElement('a');
    link.href = alert.image;
    link.download = `detection-${alert.timestamp.toISOString().replace(/:/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  // Obtenir uniquement les détections actuelles (supprime les duplicatas)
  getCurrentDetections(): Detection[] {
    // Filtre pour éliminer les doublons basé sur la classe
    const uniqueDetections: { [key: string]: Detection } = {};
    
    for (const detection of this.detections) {
      if (detection && detection.class) {
        uniqueDetections[detection.class] = detection;
      }
    }
    
    return Object.values(uniqueDetections);
  }

  ngOnDestroy() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.stopStreaming();
  }
}