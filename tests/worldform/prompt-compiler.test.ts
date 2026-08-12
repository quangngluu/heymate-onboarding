import { describe, expect, it } from 'vitest';
import {
  AFTERBURN_WORLD_PACK_V1,
  MATE_FORM_STANDARD_V01,
  RESIN_FACTORY_DRAFT_V1,
} from '../../src/worldform/domain/fixtures';
import { compileWorldformPrompt } from '../../src/worldform/domain/prompt-compiler';
import type { UserIdentity } from '../../src/worldform/domain/types';

const identity: UserIdentity = {
  photo: {
    fileName: 'identity.webp',
    mimeType: 'image/webp',
    dataUri: 'data:image/webp;base64,YQ==',
  },
  appearance: {
    recognitionCues: ['round glasses'],
    hair: 'short layered black hair',
  },
  desiredSelf: {
    description: 'A quiet observer who protects people by noticing the signal first.',
    feelings: ['calm', 'mysterious'],
  },
};

function compile(view: 'front' | 'side' | 'back') {
  return compileWorldformPrompt({
    mateForm: MATE_FORM_STANDARD_V01,
    worldPack: AFTERBURN_WORLD_PACK_V1,
    archetype: AFTERBURN_WORLD_PACK_V1.archetypes[3],
    identity,
    manufacturing: RESIN_FACTORY_DRAFT_V1,
    view,
  });
}

describe('Worldform PromptCompiler', () => {
  it('compiles a single front figurine asset with product and manufacturing constraints', () => {
    const prompt = compile('front').text;
    expect(prompt).toContain('Create exactly one straight front');
    expect(prompt).toContain('Do not depict a realistic human wearing a costume.');
    expect(prompt).toContain('50 mm base target');
    expect(prompt).toContain('100-150 mm total height');
    expect(prompt).toContain('round glasses');
    expect(prompt).toContain('No text, UI, graphic layout, collage, or character sheet.');
    expect(prompt).toContain('FACE = who I am');
    expect(prompt).toContain('BODY = who I become in this world');
    expect(prompt).toContain('SIGNATURE ASSET = which universe I belong to');
    expect(prompt).toContain('Create exactly one hero Signature Asset: Resonance Halo (vfx).');
    expect(prompt).toContain('Attach it only through back_port + base_port');
    expect(prompt).toContain('3 mm is an engineering prototype hypothesis');
    expect(prompt).toContain('Signature Assets use mechanical keyed pegs, not magnets.');
    expect(prompt).toContain('World Body must still look intentionally complete');
    expect(prompt).not.toContain(identity.photo.dataUri);
  });

  it('makes the approved front the source of truth for each separate later view', () => {
    const side = compile('side').text;
    const back = compile('back').text;
    expect(side).toContain('exactly one side camera view');
    expect(back).toContain('exactly one back camera view');
    expect(side).toContain('approved front reference is the canonical design source');
    expect(back).toContain('Only the camera angle changes.');
    expect(side).toContain('hidden attachment interfaces, Signature Kit');
    expect(side).toContain('No text, UI, graphic layout, collage, turnaround sheet');
  });
});
