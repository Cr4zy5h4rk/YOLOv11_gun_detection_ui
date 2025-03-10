import { Component } from '@angular/core';
import { VideoComponent } from "../../video/video/video.component";

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [VideoComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {

}
