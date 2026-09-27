/**
 * Lecke-kártyák: modellenként 1 magyarázó kártya a UI-ban.
 */

import type { Lang } from './i18n';

export interface Lesson {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}

export const LESSONS: Record<string, Lesson> = {
  cantilever: {
    title: {
      hu: 'Miért hajlik? Miért ott a legnagyobb feszültség?',
      en: 'Why does it bend? Why is the stress highest there?',
    },
    body: {
      hu: 'A befogásnál a hajlítónyomaték a legnagyobb: M(x) = P·(L−x). A felső szálak húzásra, az alsók nyomásra dolgoznak, a semleges szál környéke szinte feszültségmentes. Figyeld meg a hőtérképen!',
      en: 'The bending moment is largest at the fixed end: M(x) = P·(L−x). Top fibres are in tension, bottom in compression; near the neutral axis the stress almost vanishes. Watch the heatmap!',
    },
  },
  trussBridge: {
    title: {
      hu: 'Rúdrendszer vagy folytonos szerkezet?',
      en: 'Truss or continuous structure?',
    },
    body: {
      hu: 'A rácsos tartó mezőiben a feszültség közel egyenletes: a felső öv nyomásra, az alsó húzásra dolgozik, az átlósok nyíróerőt visznek át. Növeld a terhelést, és figyeld, hol nő leggyorsabban a feszültség!',
      en: 'Stress is nearly uniform in each member: top chord in compression, bottom in tension, diagonals carry shear. Increase the load and watch where stress grows fastest!',
    },
  },
  plateWithHole: {
    title: {
      hu: 'Feszültségkoncentráció: a háromszoros szabály',
      en: 'Stress concentration: the rule of three',
    },
    body: {
      hu: 'Körlyuk mellett σmax ≈ 3σ₀ — a feszültség a lyuk két oldalán koncentrálódik. Ezért repednek a lemezek lyukaktól és sarkoktól! Változtasd a hálósűrűséget: finom hálón a csúcs közelít a 3σ₀-hoz.',
      en: 'Near a circular hole σmax ≈ 3σ₀ — stress concentrates at the sides of the hole. That is why plates crack at holes and corners! Try finer meshes: the peak approaches 3σ₀.',
    },
  },
};

export function lessonFor(modelId: string, lang: Lang): Lesson | undefined {
  const lesson = LESSONS[modelId];
  if (!lesson) return undefined;
  return {
    title: { hu: lesson.title[lang], en: lesson.title[lang] },
    body: { hu: lesson.body[lang], en: lesson.body[lang] },
  };
}
