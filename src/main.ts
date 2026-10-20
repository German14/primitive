import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app/app';
import { providers } from './app/services/providers';

bootstrapApplication(App, { providers: [provideHttpClient(), ...providers] })
  .catch(err => console.error(err));
