export const COPY = {
  arrival: {
    headline: 'Every universe has its codes.',
    subline: 'Choose where you belong. Then make it yours.',
    cta: 'Enter Afterburn City',
    skip: 'Skip intro',
  },
  studio: {
    panelTitle: 'Make it yours',
    panelLead: 'Your Mate is regenerated from this character. Describe yourself, or drop in a photo.',
    textTab: 'Describe',
    photoTab: 'Photo',
    textPlaceholder: 'Layered black hair, round glasses, calm, smart casual.',
    photoHint: 'Stays on your device.',
    choosePhoto: 'Choose image',
    generate: 'Generate My Mate',
    processing: ['Reading your input', 'Re-sculpting the base', 'Painting the colorway'],
    baseNote: 'Base model locked to the collectible line.',
  },
  reveal: {
    kicker: 'Your Mate',
    namePlaceholder: 'Name your Mate',
    join: 'Join Afterburn City',
    back: 'Back to Studio',
  },
  joined: {
    headline: 'Welcome to Afterburn City.',
    subline: 'Yours, and unmistakably one of the line.',
    restart: 'Start over',
  },
  errors: {
    badImage: 'That file is not an image we can read. Try a JPG or PNG.',
    emptyInput: 'Describe yourself or add a photo first.',
    generic: 'Something glitched. Try again.',
  },
} as const;
