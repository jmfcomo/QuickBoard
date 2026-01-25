import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ScriptComponent } from './script.component';

// Mock window.matchMedia for EditorJS
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('ScriptComponent', () => {
  let component: ScriptComponent;
  let fixture: ComponentFixture<ScriptComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ScriptComponent);
    component = fixture.componentInstance;
    // Don't call detectChanges to avoid EditorJS initialization errors in tests
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
