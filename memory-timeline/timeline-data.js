/* ==========================================================================
   timeline-data.js — ALL editable content lives here.
   --------------------------------------------------------------------------
   • Add, remove or reorder objects in `chapters` — the scroll logic, the
     navigation rail and the pinning distances are generated from this array.
   • Everything below is fictional placeholder text. Replace it freely.

   Chapter fields
   --------------
   date         Short date / season label shown above the title.
   title        Chapter heading.
   description  One or two sentences.
   location     (optional) Small metadata line under the description.
   label        (optional) Tiny label shown beside the big outlined numeral.
   caption      (optional) Caption under the image.
   src          (optional) Path to a photo, e.g. "photos/01.jpg".
                Leave it out to get the built-in CSS placeholder artwork.
   alt          (optional) Alt text for the image / placeholder.
   width/height (optional) Intrinsic size of `src`; only used as a hint.
                The frame always reserves its space, so nothing shifts on load.
   accent       (optional) Any CSS colour. Tints the fog + placeholder art.
   layout       (optional) "text-first" (default) | "image-first" | "panorama"
   ========================================================================== */

window.TIMELINE_CONFIG = {
  /* Pixels of vertical scrolling spent per pixel of horizontal travel while a
     chapter is pinned. 1 = 1:1. Raise it (e.g. 1.4) for a slower, longer pan. */
  scrollSpeed: 1,

  hero: {
    eyebrow: 'A story in chapters',
    title: 'Title Placeholder',
    subtitle: 'A single quiet line for a dedication. Replace this text.',
    instruction: 'Scroll slowly — every chapter turns sideways',   // shown when chapters pan horizontally
    instructionStacked: 'Scroll slowly — one chapter at a time',    // shown on phones / reduced motion
  },

  chapters: [
    {
      date: 'Season placeholder · 20XX',
      title: 'The First Frame',
      description:
        'A short placeholder description for the opening chapter. Swap this for a sentence or two about the moment.',
      location: 'Location placeholder',
      label: 'Opening',
      caption: 'Placeholder image — replace with a photo',
      accent: '#8d9bb5',
      layout: 'text-first',
    },
    {
      date: 'Month 00 · 20XX',
      title: 'A Quiet Afternoon',
      description:
        'Another placeholder paragraph. Keep it short so the typography stays calm and easy to read while scrolling.',
      location: 'Somewhere placeholder',
      label: 'Stillness',
      caption: 'Placeholder image — replace with a photo',
      accent: '#b3a38a',
      layout: 'image-first',
    },
    {
      date: 'Month 00 · 20XX',
      title: 'Somewhere In Between',
      description:
        'A wider chapter for a panoramic photo. Use this layout for landscapes, skylines and long horizons.',
      location: 'Place name placeholder',
      label: 'Horizon',
      caption: 'Placeholder panorama — replace with a wide photo',
      accent: '#8fa699',
      layout: 'panorama',
    },
    {
      date: 'Month 00 · 20XX',
      title: 'The Long Way Home',
      description:
        'Placeholder text again. Each chapter reads the same way: number, date, title, a few words, one big image.',
      location: 'Location placeholder',
      label: 'Departure',
      caption: 'Placeholder image — replace with a photo',
      accent: '#b0929b',
      layout: 'text-first',
    },
    {
      date: 'Month 00 · 20XX',
      title: 'What Comes Next',
      description:
        'The final placeholder chapter. After it, normal scrolling continues into the closing scene below.',
      location: 'Location placeholder',
      label: 'Beginning',
      caption: 'Placeholder image — replace with a photo',
      accent: '#9a96b3',
      layout: 'image-first',
    },
  ],

  closing: {
    eyebrow: 'The end of the reel',
    title: 'Closing Line Placeholder',
    text: 'A final message goes here. Replace it with something only you would say.',
    restart: 'Back to the beginning',
  },
};
