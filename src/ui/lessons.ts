/**
 * Lecke-kártyák: modellenként 1 magyarázó kártya a UI-ban.
 */

import type { Lang } from './i18n';

export interface Lesson {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
}

export const LESSONS: Record<string, Lesson> = {
  fixedFixed: {
    title: {
      hu: 'Befogás elleni csata: miért 5×-ösen merevebb?',
      en: 'Fight of the fixities: why 5× stiffer?',
    },
    body: {
      hu: 'A kétvégén befogott gerenda hajlása δ = q·L⁴/(384·E·I) — ötöde az egyszerűen tartotténak! A befogási nyomatékok ellendolgoznak a mező-nyomatékokkal: a gerenda három szakaszon hajlik „fel-le-fel". Válts át az egyszerűen tartottra és nézd meg a különbséget a hőtérképen!',
      en: 'The fixed–fixed beam deflects δ = q·L⁴/(384·E·I) — one fifth of the simply supported case! The restraint moments counteract the span moments: the beam bends down-up-down in three zones. Switch to the simply supported model and compare heatmaps!',
    },
  },
  corbel: {
    title: {
      hu: 'Konzol: hajlítás + nyírás együtt',
      en: 'Corbel: bending + shear together',
    },
    body: {
      hu: 'A konzolos tartó szárán a terhelés hajlítónyomaték és nyíróerő kombinációját kelti. Kövesd a feszültségáramokat: a terhelés „hideg-meleg" sávjai a sarok mentén folynak a falba. Növeld a terhelést — hol lépi át az anyag határát?',
      en: 'On the corbel stem the load creates a combination of bending moment and shear. Follow the stress flow: the hot/cold bands run through the corner into the wall. Increase the load — where does the material limit get exceeded first?',
    },
  },
  simplySupported: {
    title: {
      hu: 'Miért a középen a legnagyobb a hajlás?',
      en: 'Why is the deflection largest at midspan?',
    },
    body: {
      hu: 'Egyszerűen tartott gerendán a hajlítónyomaték M(x) = P·x/2 a közép felé nő, a csúcspont középen: M = P·L/4. A bal csukló függőleges és vízszintes irányban tart, a jobb görgő csak függőlegesen — ezért a gerenda szabadon „lélegezhet": a vízszintes vegyhatás nem keletkezik. Hasonlítsd össze a konzolgerendával!',
      en: 'In a simply supported beam the moment M(x) = P·x/2 grows toward midspan where it peaks at M = P·L/4. The left pin restrains both directions while the right roller allows horizontal movement — so no unwanted axial force builds up. Compare with the cantilever!',
    },
  },
  portalFrame: {
    title: {
      hu: 'Keret: a sarokcsomó viszi át a nyomatéket',
      en: 'Frames: the corner joint transfers the moment',
    },
    body: {
      hu: 'A keret sarkainál a gerenda hajlítónyomatéka átfolyik az oszlopba — ez tartja a rendszert anélkül, hogy az oszlopok extra támaszt kapnának. Nézd meg a hőtérképen: a legnagyobb feszültség épp a sarkokban és a gerenda közepén van!',
      en: 'At the frame corners the beam moment flows into the columns — this keeps the structure stable without extra supports. Watch the heatmap: the highest stress appears right at the corners and mid-span!',
    },
  },
  plateTwoHoles: {
    title: {
      hu: 'Két lyuk: a nettó keresztmetszet szabálya',
      en: 'Two holes: the net-section rule',
    },
    body: {
      hu: 'A lyukak sávjában csak a nettó keresztmetszet viszi a terhelést: σ_nettó = σ₀·W/(W−d). A két lyuk között a feszültség még tovább koncentrálódik — ezért szakadnak itt a kötések! Változtasd az anyagot és a terhelést, és hasonlítsd össze az egylyukú lemezzel.',
      en: 'In the hole row only the net section carries load: σ_net = σ₀·W/(W−d). Stress concentrates even more between the holes — that is where bolted joints crack! Change material and load, then compare with the single-hole plate.',
    },
  },
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
