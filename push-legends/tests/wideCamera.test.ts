import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWideCamera } from '../src/platform/pose';

/** A fake camera track with a zoom capability and settings that follow applyConstraints. */
function fakeTrack(deviceId: string, zoom: { min: number; now: number } | null, size = { width: 1280, height: 960 }) {
  let z = zoom?.now;
  return {
    stop: vi.fn(),
    getSettings: () => ({ deviceId, ...size, ...(z !== undefined ? { zoom: z } : {}) }),
    getCapabilities: () => (zoom ? { zoom: { min: zoom.min, max: 10 } } : {}),
    applyConstraints: vi.fn(async (c: { advanced: { zoom: number }[] }) => {
      z = c.advanced[0]!.zoom;
    }),
  };
}

function fakeStream(track: ReturnType<typeof fakeTrack>) {
  return { getVideoTracks: () => [track], getTracks: () => [track] };
}

function install(getUserMedia: (c: MediaStreamConstraints) => unknown, devices: { kind: string; label: string; deviceId: string }[]) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(getUserMedia), enumerateDevices: vi.fn(async () => devices) } });
  return (globalThis.navigator as unknown as { mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> } }).mediaDevices.getUserMedia;
}

afterEach(() => vi.unstubAllGlobals());

describe('wide camera', () => {
  it('asks for the full 4:3 sensor instead of a cropped 16:9 picture', async () => {
    const gum = install(async () => fakeStream(fakeTrack('front', null)), []);
    const { view } = await openWideCamera('user');
    const video = (gum.mock.calls[0]![0] as MediaStreamConstraints).video as MediaTrackConstraints;
    expect(video.aspectRatio).toEqual({ ideal: 4 / 3 });
    expect(video.height).toEqual({ ideal: 960 });
    expect(view.lens).toBe('standard');
  });

  it('switches to the ultra-wide back lens when the phone lists one', async () => {
    const first = fakeTrack('back-main', null);
    const wide = fakeTrack('back-ultra', null);
    const gum = install(
      async (c) => fakeStream(((c.video as MediaTrackConstraints).deviceId ? wide : first)),
      [
        { kind: 'videoinput', label: 'Front Camera', deviceId: 'front' },
        { kind: 'videoinput', label: 'Back Camera', deviceId: 'back-main' },
        { kind: 'videoinput', label: 'Back Ultra Wide Camera', deviceId: 'back-ultra' },
      ],
    );
    const { stream, view } = await openWideCamera('environment');
    expect(gum).toHaveBeenCalledTimes(2);
    expect(first.stop).toHaveBeenCalled();
    expect((stream as unknown as ReturnType<typeof fakeStream>).getVideoTracks()[0]).toBe(wide);
    expect(view.lens).toBe('ultrawide');
  });

  it('zooms out as far as the track allows', async () => {
    const track = fakeTrack('back', { min: 0.5, now: 1 });
    install(async () => fakeStream(track), []);
    const { view } = await openWideCamera('environment');
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 0.5 }] });
    expect(view.zoom).toBe(0.5);
  });

  it('keeps the first camera when the ultra-wide lens cannot be opened', async () => {
    const first = fakeTrack('back-main', null);
    install(
      async (c) => {
        if ((c.video as MediaTrackConstraints).deviceId) throw new Error('busy');
        return fakeStream(first);
      },
      [{ kind: 'videoinput', label: 'camera 0.5x back', deviceId: 'w' }],
    );
    const { view, stream } = await openWideCamera('environment');
    expect((stream as unknown as ReturnType<typeof fakeStream>).getVideoTracks()[0]).toBe(first);
    expect(first.stop).not.toHaveBeenCalled();
    expect(view.lens).toBe('standard');
  });
});
