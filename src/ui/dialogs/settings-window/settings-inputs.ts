
export interface NewSettings {
    warning: boolean,
    theme: 'system' | 'white' | 'light' | 'black' | 'sepia' | 'dark',
    framerate: '30' | '24' | '60',
    volume: number
}