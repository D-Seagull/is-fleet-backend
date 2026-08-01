/**
 * Minimal server-side i18n for user-facing text the backend generates
 * (push-notification titles/bodies for now). Each recipient's `User.language`
 * picks the locale; unsupported values (UZ/KZ/HI) and nulls fall back to UK,
 * which is the source language the strings were originally written in.
 *
 * Keys are flat dotted strings; `{{param}}` placeholders are interpolated.
 */
type Params = Record<string, string | number>;

const SUPPORTED = ['uk', 'en', 'pl', 'lt', 'ru'] as const;
type Locale = (typeof SUPPORTED)[number];

const messages: Record<Locale, Record<string, string>> = {
  uk: {
    'push.newMessage': 'Нове повідомлення',
    'push.newLoading': 'Нове завантаження',
    'push.tripAssigned': 'Призначено рейс',
    'push.managerChanged': 'Менеджер змінений',
    'push.newManager': 'Ваш новий менеджер: {{name}}',
    'push.noName': 'без імені',
    'push.truckAssignment': 'Призначення вантажівки',
    'push.assignedToTruck': 'Вас призначено на {{plate}}',
    'push.assignedTruck': 'Вам призначено вантажівку {{plate}}',
  },
  en: {
    'push.newMessage': 'New message',
    'push.newLoading': 'New loading',
    'push.tripAssigned': 'Trip assigned',
    'push.managerChanged': 'Manager changed',
    'push.newManager': 'Your new manager: {{name}}',
    'push.noName': 'no name',
    'push.truckAssignment': 'Truck assignment',
    'push.assignedToTruck': "You've been assigned to {{plate}}",
    'push.assignedTruck': "You've been assigned truck {{plate}}",
  },
  pl: {
    'push.newMessage': 'Nowa wiadomość',
    'push.newLoading': 'Nowy załadunek',
    'push.tripAssigned': 'Przydzielono trasę',
    'push.managerChanged': 'Zmieniono menedżera',
    'push.newManager': 'Twój nowy menedżer: {{name}}',
    'push.noName': 'bez nazwy',
    'push.truckAssignment': 'Przydział ciężarówki',
    'push.assignedToTruck': 'Przydzielono cię do {{plate}}',
    'push.assignedTruck': 'Przydzielono ci ciężarówkę {{plate}}',
  },
  lt: {
    'push.newMessage': 'Nauja žinutė',
    'push.newLoading': 'Naujas pakrovimas',
    'push.tripAssigned': 'Priskirtas reisas',
    'push.managerChanged': 'Vadovas pakeistas',
    'push.newManager': 'Jūsų naujas vadovas: {{name}}',
    'push.noName': 'be vardo',
    'push.truckAssignment': 'Vilkiko priskyrimas',
    'push.assignedToTruck': 'Jūs priskirtas prie {{plate}}',
    'push.assignedTruck': 'Jums priskirtas vilkikas {{plate}}',
  },
  ru: {
    'push.newMessage': 'Новое сообщение',
    'push.newLoading': 'Новая погрузка',
    'push.tripAssigned': 'Назначен рейс',
    'push.managerChanged': 'Менеджер изменён',
    'push.newManager': 'Ваш новый менеджер: {{name}}',
    'push.noName': 'без имени',
    'push.truckAssignment': 'Назначение грузовика',
    'push.assignedToTruck': 'Вас назначили на {{plate}}',
    'push.assignedTruck': 'Вам назначен грузовик {{plate}}',
  },
};

function resolve(lang?: string | null): Locale {
  const l = (lang ?? '').toLowerCase();
  return (SUPPORTED as readonly string[]).includes(l) ? (l as Locale) : 'uk';
}

/** Translate `key` into the given language, interpolating `{{param}}` slots. */
export function t(
  lang: string | null | undefined,
  key: string,
  params?: Params,
): string {
  const locale = resolve(lang);
  const raw = messages[locale][key] ?? messages.uk[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] === undefined ? `{{${k}}}` : String(params[k]),
  );
}
