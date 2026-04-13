import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

export interface NativeToolbarPlugin {
  setTitle(options: { title: string }): Promise<void>;
}

const NativeToolbar = registerPlugin<NativeToolbarPlugin>('NativeToolbar');

@Injectable({
  providedIn: 'root',
})
export class NativeToolbarService {
  async setTitle(title: string): Promise<void> {
    try {
      await NativeToolbar.setTitle({ title });
    } catch (error) {
      console.warn('NativeToolbar plugin is not available on this platform.', error);
    }
  }
}
