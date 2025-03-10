import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard/dashboard.component';
import { VideoComponent } from './components/video/video/video.component';
import { VideoUploadComponent } from './components/video/video-upload/video-upload.component';

export const routes: Routes = [
    { path: '',component: VideoComponent, pathMatch: 'full' },
    { path: 'video', component: VideoUploadComponent, pathMatch: 'full' },
];
