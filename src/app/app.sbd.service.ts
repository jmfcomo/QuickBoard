import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import { AppStore } from '../data/store/app.store';
import { AudioService } from '../services/audio.service';

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
};

@Injectable({ providedIn: 'root' })
export class SbdService {
  private readonly store = inject(AppStore);
  private readonly audio = inject(AudioService);

  async buildSbdZip(): Promise<Uint8Array> {
    const zip = new JSZip();
    const audioBuffers = this.audio.getFileBuffers();

    // Replace live blob URLs with stable zip-relative paths before serialising.
    const rawJson = JSON.parse(this.store.exportAsJson());
    if (Array.isArray(rawJson.audioTracks)) {
      rawJson.audioTracks = rawJson.audioTracks.map(
        (track: { id: string; name: string; url: string }) => {
          const ext = track.name.includes('.') ? track.name.split('.').pop() : 'audio';
          return { ...track, url: `audio/${track.id}.${ext}` };
        },
      );
    }
    if (Array.isArray(rawJson.boards)) {
      rawJson.boards = rawJson.boards.map((board: { previewUrl?: string }) => ({
        ...board,
        previewUrl: board.previewUrl?.startsWith('blob:') ? null : (board.previewUrl ?? null),
      }));
    }
    zip.file('project.json', JSON.stringify(rawJson, null, 2));

    for (const [id, { buffer, fileName }] of audioBuffers) {
      const ext = fileName.includes('.') ? fileName.split('.').pop() : 'audio';
      zip.file(`audio/${id}.${ext}`, buffer);
    }

    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /** Restores state from a plain-JSON project file (legacy format). */
  loadLegacyJson(json: string): void {
    this.store.loadFromJson(json);
  }

  async loadSbdZip(base64Content: string): Promise<void> {
    // Decode base64 → binary.
    const binaryStr = atob(base64Content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const zip = await JSZip.loadAsync(bytes);

    const projectFile = zip.file('project.json');
    if (!projectFile) throw new Error('Invalid .sbd file: missing project.json');
    const projectJson = await projectFile.async('string');
    const projectData = JSON.parse(projectJson);

    // Extract each audio file into a Blob keyed by track id.
    const audioTracks: { id: string; url: string }[] = Array.isArray(projectData.audioTracks)
      ? projectData.audioTracks
      : [];

    const blobMap = new Map<string, Blob>();
    await Promise.all(
      audioTracks.map(async (track) => {
        const zipEntry = zip.file(track.url); // url is "audio/<id>.<ext>"
        if (!zipEntry) return;
        const arrayBuffer = await zipEntry.async('arraybuffer');
        const ext = track.url.split('.').pop() ?? 'audio';
        const mime = MIME_TYPES[ext] ?? 'audio/mpeg';
        blobMap.set(track.id, new Blob([arrayBuffer], { type: mime }));
      }),
    );

    // Restore store state then reload Tone.js players from the extracted blobs.
    this.store.loadFromJson(projectJson);
    await this.audio.loadFromSavedTracks(this.store.audioTracks(), blobMap);
  }
}
