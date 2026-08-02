import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ambience } from '../../src/audio/ambience';

function installAudioContext() {
  const streamedSources: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
  class FakeAudioContext {
    currentTime = 1;
    sampleRate = 32_000;
    state = 'running';
    destination = {};
    createGain() {
      return {
        gain: {
          value: 0,
          setTargetAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, connect: vi.fn() };
    }
    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        detune: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return {
        duration: length / sampleRate,
        copyToChannel: vi.fn(),
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      streamedSources.push(source);
      return source;
    }
    resume() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return streamedSources;
}

afterEach(() => vi.unstubAllGlobals());

describe('streamed speech playback', () => {
  it('stops every scheduled chunk when playback is cancelled', () => {
    const sources = installAudioContext();
    const ambience = new Ambience();
    const stream = ambience.openStream(32_000);
    stream.push(new Float32Array([0.1, 0.2]));
    stream.push(new Float32Array([0.3, 0.4]));

    ambience.stopClip();

    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.stop.mock.calls.length)).toEqual([1, 1]);
  });
});
