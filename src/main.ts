import { bootstrapApplication } from '@angular/platform-browser';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app/app';
import { providers } from './app/services/providers';

registerLocaleData(localeEs);

bootstrapApplication(App, { providers: [provideHttpClient(), { provide: LOCALE_ID, useValue: 'es' }, ...providers] })
  .catch(err => console.error(err));