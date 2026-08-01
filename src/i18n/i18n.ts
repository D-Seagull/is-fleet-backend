/**
 * Minimal server-side i18n for user-facing text the backend generates:
 * push-notification titles/bodies and HTTP exception messages. Each
 * recipient's / requester's `User.language` picks the locale; unsupported
 * values (UZ/KZ/HI) and nulls fall back to UK — the source language the
 * strings were originally written in.
 *
 * Keys are flat dotted strings; `{{param}}` placeholders are interpolated.
 * Exception messages are thrown as the key (e.g.
 * `throw new NotFoundException('errors.tripNotFound')`); the global
 * AllExceptionsFilter translates them per request. A string that is not a
 * known key passes through unchanged, so non-keyed messages are safe.
 */
type Params = Record<string, string | number>;

const SUPPORTED = ['uk', 'en', 'pl', 'lt', 'ru'] as const;
type Locale = (typeof SUPPORTED)[number];

const messages: Record<Locale, Record<string, string>> = {
  uk: {
    // push
    'push.newMessage': 'Нове повідомлення',
    'push.newLoading': 'Нове завантаження',
    'push.tripAssigned': 'Призначено рейс',
    'push.managerChanged': 'Менеджер змінений',
    'push.newManager': 'Ваш новий менеджер: {{name}}',
    'push.noName': 'без імені',
    'push.truckAssignment': 'Призначення вантажівки',
    'push.assignedToTruck': 'Вас призначено на {{plate}}',
    'push.assignedTruck': 'Вам призначено вантажівку {{plate}}',
    // errors — not found
    'errors.tripNotFound': 'Рейс не знайдений',
    'errors.documentNotFound': 'Документ не знайдений',
    'errors.groupNotFound': 'Група не знайдена',
    'errors.companyNotFound': 'Компанія не знайдена',
    'errors.userNotFound': 'Користувача не знайдено',
    'errors.alarmNotFound': 'Будильник не знайдено',
    'errors.truckNotFound': 'Вантажівку не знайдено',
    'errors.noteNotFound': 'Нотатку не знайдено',
    'errors.managerNotFound': 'Менеджера не знайдено',
    'errors.draftNotFound': 'Чернетка не знайдена',
    'errors.announcementNotFound': 'Оголошення не знайдено',
    'errors.truckNotInGroup': 'Вантажівка не знайдена в групі',
    'errors.managerNotInGroup': 'Менеджер не знайдений в групі',
    'errors.noOwnerForDriverGroup':
      'Немає менеджера/тімліда, щоб створити групу водіїв',
    'errors.messageNotFound': 'Повідомлення не знайдене',
    'errors.driverNotFound': 'Водій не знайдений',
    'errors.sessionNotFound': 'Сесію не знайдено',
    'errors.noActiveSession': 'Немає активної чат-сесії для цього рейсу',
    // errors — forbidden / access
    'errors.editOwnAnnouncements': 'Можна редагувати тільки свої оголошення',
    'errors.onlyAdminDeactivate':
      'Лише адміністратор може деактивувати цього користувача',
    'errors.noPermissionDeactivate':
      'У вас немає дозволу деактивувати цього користувача',
    'errors.cannotDeleteDocument': 'Ви не можете видалити цей документ',
    'errors.onlyGroupMembersEdit':
      'Лише учасники групи можуть редагувати її.',
    'errors.editOwnGroups': 'Можна редагувати тільки свої групи',
    'errors.onlyCreatorDeleteGroup':
      'Видаляти може тільки той, хто створив групу',
    'errors.notTrucksGroup':
      'Це група менеджерів — не можна додавати вантажівки',
    'errors.notManagersGroup':
      'Це група вантажівок — не можна додавати менеджерів',
    'errors.canAddManagersOnly': 'Можна додавати тільки менеджерів або тімлідів',
    'errors.notGroupMember': 'Ви не є учасником цієї групи',
    'errors.cannotCreateAlarmForUser':
      'Не можна створити будильник для цього користувача',
    'errors.noAccessTrip': 'Немає доступу до цього рейсу',
    'errors.onlyCreatorEditAlarm':
      'Лише той, хто створив, може редагувати цей будильник',
    'errors.noAccessAlarm': 'Немає доступу до цього будильника',
    'errors.noAccessChatSession': 'Немає доступу до цієї чат-сесії',
    'errors.onlyDriverOrManagerChat':
      'Тільки поточний водій або менеджер можуть писати в цей чат',
    'errors.messageNotEmpty': 'Повідомлення не може бути порожнім',
    'errors.editOwnMessages': 'Ви можете редагувати лише свої повідомлення',
    'errors.cannotEditDeleted': 'Не можна редагувати видалене повідомлення',
    'errors.systemMessagesNotEditable': 'Системні повідомлення не редагуються',
    'errors.editWindowPassed': 'Час на редагування минув (15 хв)',
    'errors.cannotDeleteMessage': 'Ви не можете видалити це повідомлення',
    'errors.driverNotActive': 'Акаунт водія неактивний.',
    // errors — bad request / conflict / auth
    'errors.phoneFormat':
      'Номер має бути в міжнародному форматі, напр. +380501234567',
    'errors.userExists': 'Користувач з таким email або телефоном вже існує.',
    'errors.phoneUsedDriver':
      'Цей номер телефону вже використовує інший водій.',
    'errors.phoneUsedUser': 'Цей номер уже використовується іншим користувачем.',
    'errors.scoreRange': 'Оцінка має бути від 1 до 5',
    'errors.companyExists': 'Компанія з такою назвою вже створена',
    'errors.noAccess': 'Немає доступу',
    'errors.wrongEmailOrPassword': 'Невірний email або пароль',
    'errors.invalidOrExpiredToken': 'Невірний або прострочений токен',
    'errors.loginOrPasswordWrong': 'Логін або пароль невірні',
    'errors.invalidToken': 'Невірний токен',
    'errors.codeInvalidOrExpired': 'Код невірний або прострочений.',
    'errors.tooManyAttempts': 'Забагато спроб. Запросіть новий код.',
    'errors.pleaseWaitCode': 'Зачекайте перед запитом нового коду.',
    'errors.linkInvalidOrExpired': 'Посилання недійсне або застаріле',
    'errors.userGoneOrDeactivated':
      'Користувача більше не існує або він деактивований',
    'errors.unsupportedEmoji': 'Емодзі не підтримується',
    'errors.recordExists': 'Такий запис вже існує',
    'errors.recordNotFound': 'Запис не знайдений',
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
    'errors.tripNotFound': 'Trip not found',
    'errors.documentNotFound': 'Document not found',
    'errors.groupNotFound': 'Group not found',
    'errors.companyNotFound': 'Company not found',
    'errors.userNotFound': 'User not found',
    'errors.alarmNotFound': 'Alarm not found',
    'errors.truckNotFound': 'Truck not found',
    'errors.noteNotFound': 'Note not found',
    'errors.managerNotFound': 'Manager not found',
    'errors.draftNotFound': 'Draft not found',
    'errors.announcementNotFound': 'Announcement not found',
    'errors.truckNotInGroup': 'Truck not found in the group',
    'errors.managerNotInGroup': 'Manager not found in the group',
    'errors.noOwnerForDriverGroup':
      'No manager/teamlead to create a driver group',
    'errors.messageNotFound': 'Message not found',
    'errors.driverNotFound': 'Driver not found',
    'errors.sessionNotFound': 'Session not found',
    'errors.noActiveSession': 'No active chat session for this trip',
    'errors.editOwnAnnouncements': 'You can only edit your own announcements',
    'errors.onlyAdminDeactivate': 'Only an admin can deactivate this user',
    'errors.noPermissionDeactivate':
      'You do not have permission to deactivate this user',
    'errors.cannotDeleteDocument': "You can't delete this document",
    'errors.onlyGroupMembersEdit': 'Only group members can edit it.',
    'errors.editOwnGroups': 'You can only edit your own groups',
    'errors.onlyCreatorDeleteGroup': 'Only the creator can delete the group',
    'errors.notTrucksGroup': "This is a managers group — you can't add trucks",
    'errors.notManagersGroup':
      "This is a trucks group — you can't add managers",
    'errors.canAddManagersOnly': 'You can only add managers or teamleads',
    'errors.notGroupMember': "You're not a member of this group",
    'errors.cannotCreateAlarmForUser': 'Cannot create alarm for that user',
    'errors.noAccessTrip': 'No access to this trip',
    'errors.onlyCreatorEditAlarm': 'Only the creator can edit this alarm',
    'errors.noAccessAlarm': 'No access to this alarm',
    'errors.noAccessChatSession': 'No access to this chat session',
    'errors.onlyDriverOrManagerChat':
      'Only the current driver or manager can write in this chat',
    'errors.messageNotEmpty': "Message can't be empty",
    'errors.editOwnMessages': 'You can only edit your own messages',
    'errors.cannotEditDeleted': "Can't edit a deleted message",
    'errors.systemMessagesNotEditable': "System messages can't be edited",
    'errors.editWindowPassed': 'The edit window has passed (15 min)',
    'errors.cannotDeleteMessage': "You can't delete this message",
    'errors.driverNotActive': 'Driver account is not active.',
    'errors.phoneFormat':
      'Phone must be in international format, e.g. +380501234567',
    'errors.userExists': 'A user with this email or phone already exists.',
    'errors.phoneUsedDriver':
      'This phone number is already used by another driver.',
    'errors.phoneUsedUser': 'This number is already used by another user.',
    'errors.scoreRange': 'Score must be between 1 and 5',
    'errors.companyExists': 'Company with this name already created',
    'errors.noAccess': 'No access',
    'errors.wrongEmailOrPassword': 'Wrong email or password',
    'errors.invalidOrExpiredToken': 'Invalid or expired token',
    'errors.loginOrPasswordWrong': 'Login or password is wrong',
    'errors.invalidToken': 'Invalid token',
    'errors.codeInvalidOrExpired': 'Code is invalid or expired.',
    'errors.tooManyAttempts': 'Too many attempts. Please request a new code.',
    'errors.pleaseWaitCode': 'Please wait before requesting another code.',
    'errors.linkInvalidOrExpired': 'The link is invalid or expired',
    'errors.userGoneOrDeactivated': 'User no longer exists or is deactivated',
    'errors.unsupportedEmoji': 'Unsupported emoji',
    'errors.recordExists': 'This record already exists',
    'errors.recordNotFound': 'Record not found',
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
    'errors.tripNotFound': 'Nie znaleziono trasy',
    'errors.documentNotFound': 'Nie znaleziono dokumentu',
    'errors.groupNotFound': 'Nie znaleziono grupy',
    'errors.companyNotFound': 'Nie znaleziono firmy',
    'errors.userNotFound': 'Nie znaleziono użytkownika',
    'errors.alarmNotFound': 'Nie znaleziono budzika',
    'errors.truckNotFound': 'Nie znaleziono ciężarówki',
    'errors.noteNotFound': 'Nie znaleziono notatki',
    'errors.managerNotFound': 'Nie znaleziono menedżera',
    'errors.draftNotFound': 'Nie znaleziono wersji roboczej',
    'errors.announcementNotFound': 'Nie znaleziono ogłoszenia',
    'errors.truckNotInGroup': 'Nie znaleziono ciężarówki w grupie',
    'errors.managerNotInGroup': 'Nie znaleziono menedżera w grupie',
    'errors.noOwnerForDriverGroup':
      'Brak menedżera/kierownika do utworzenia grupy kierowców',
    'errors.messageNotFound': 'Nie znaleziono wiadomości',
    'errors.driverNotFound': 'Nie znaleziono kierowcy',
    'errors.sessionNotFound': 'Nie znaleziono sesji',
    'errors.noActiveSession': 'Brak aktywnej sesji czatu dla tej trasy',
    'errors.editOwnAnnouncements': 'Możesz edytować tylko własne ogłoszenia',
    'errors.onlyAdminDeactivate':
      'Tylko administrator może dezaktywować tego użytkownika',
    'errors.noPermissionDeactivate':
      'Nie masz uprawnień do dezaktywacji tego użytkownika',
    'errors.cannotDeleteDocument': 'Nie możesz usunąć tego dokumentu',
    'errors.onlyGroupMembersEdit': 'Tylko członkowie grupy mogą ją edytować.',
    'errors.editOwnGroups': 'Możesz edytować tylko własne grupy',
    'errors.onlyCreatorDeleteGroup': 'Usunąć może tylko twórca grupy',
    'errors.notTrucksGroup':
      'To grupa menedżerów — nie można dodawać ciężarówek',
    'errors.notManagersGroup':
      'To grupa ciężarówek — nie można dodawać menedżerów',
    'errors.canAddManagersOnly':
      'Można dodawać tylko menedżerów lub kierowników',
    'errors.notGroupMember': 'Nie jesteś członkiem tej grupy',
    'errors.cannotCreateAlarmForUser':
      'Nie można utworzyć budzika dla tego użytkownika',
    'errors.noAccessTrip': 'Brak dostępu do tej trasy',
    'errors.onlyCreatorEditAlarm': 'Tylko twórca może edytować ten budzik',
    'errors.noAccessAlarm': 'Brak dostępu do tego budzika',
    'errors.noAccessChatSession': 'Brak dostępu do tej sesji czatu',
    'errors.onlyDriverOrManagerChat':
      'Tylko obecny kierowca lub menedżer może pisać na tym czacie',
    'errors.messageNotEmpty': 'Wiadomość nie może być pusta',
    'errors.editOwnMessages': 'Możesz edytować tylko własne wiadomości',
    'errors.cannotEditDeleted': 'Nie można edytować usuniętej wiadomości',
    'errors.systemMessagesNotEditable':
      'Wiadomości systemowe nie mogą być edytowane',
    'errors.editWindowPassed': 'Czas na edycję minął (15 min)',
    'errors.cannotDeleteMessage': 'Nie możesz usunąć tej wiadomości',
    'errors.driverNotActive': 'Konto kierowcy nie jest aktywne.',
    'errors.phoneFormat':
      'Numer musi być w formacie międzynarodowym, np. +380501234567',
    'errors.userExists':
      'Użytkownik z tym e-mailem lub telefonem już istnieje.',
    'errors.phoneUsedDriver':
      'Ten numer telefonu jest już używany przez innego kierowcę.',
    'errors.phoneUsedUser':
      'Ten numer jest już używany przez innego użytkownika.',
    'errors.scoreRange': 'Ocena musi być od 1 do 5',
    'errors.companyExists': 'Firma o tej nazwie już istnieje',
    'errors.noAccess': 'Brak dostępu',
    'errors.wrongEmailOrPassword': 'Nieprawidłowy e-mail lub hasło',
    'errors.invalidOrExpiredToken': 'Nieprawidłowy lub wygasły token',
    'errors.loginOrPasswordWrong': 'Nieprawidłowy login lub hasło',
    'errors.invalidToken': 'Nieprawidłowy token',
    'errors.codeInvalidOrExpired': 'Kod jest nieprawidłowy lub wygasł.',
    'errors.tooManyAttempts': 'Zbyt wiele prób. Poproś o nowy kod.',
    'errors.pleaseWaitCode': 'Poczekaj przed prośbą o kolejny kod.',
    'errors.linkInvalidOrExpired': 'Link jest nieprawidłowy lub wygasł',
    'errors.userGoneOrDeactivated':
      'Użytkownik już nie istnieje lub jest dezaktywowany',
    'errors.unsupportedEmoji': 'Nieobsługiwane emoji',
    'errors.recordExists': 'Taki rekord już istnieje',
    'errors.recordNotFound': 'Nie znaleziono rekordu',
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
    'errors.tripNotFound': 'Reisas nerastas',
    'errors.documentNotFound': 'Dokumentas nerastas',
    'errors.groupNotFound': 'Grupė nerasta',
    'errors.companyNotFound': 'Įmonė nerasta',
    'errors.userNotFound': 'Vartotojas nerastas',
    'errors.alarmNotFound': 'Žadintuvas nerastas',
    'errors.truckNotFound': 'Vilkikas nerastas',
    'errors.noteNotFound': 'Užrašas nerastas',
    'errors.managerNotFound': 'Vadovas nerastas',
    'errors.draftNotFound': 'Juodraštis nerastas',
    'errors.announcementNotFound': 'Skelbimas nerastas',
    'errors.truckNotInGroup': 'Vilkikas grupėje nerastas',
    'errors.managerNotInGroup': 'Vadovas grupėje nerastas',
    'errors.noOwnerForDriverGroup':
      'Nėra vadovo/komandos vadovo vairuotojų grupei sukurti',
    'errors.messageNotFound': 'Žinutė nerasta',
    'errors.driverNotFound': 'Vairuotojas nerastas',
    'errors.sessionNotFound': 'Sesija nerasta',
    'errors.noActiveSession': 'Šiam reisui nėra aktyvios pokalbių sesijos',
    'errors.editOwnAnnouncements': 'Galite redaguoti tik savo skelbimus',
    'errors.onlyAdminDeactivate':
      'Tik administratorius gali deaktyvuoti šį vartotoją',
    'errors.noPermissionDeactivate':
      'Neturite teisės deaktyvuoti šio vartotojo',
    'errors.cannotDeleteDocument': 'Negalite ištrinti šio dokumento',
    'errors.onlyGroupMembersEdit': 'Redaguoti gali tik grupės nariai.',
    'errors.editOwnGroups': 'Galite redaguoti tik savo grupes',
    'errors.onlyCreatorDeleteGroup': 'Ištrinti gali tik grupės kūrėjas',
    'errors.notTrucksGroup':
      'Tai vadovų grupė — negalima pridėti vilkikų',
    'errors.notManagersGroup':
      'Tai vilkikų grupė — negalima pridėti vadovų',
    'errors.canAddManagersOnly':
      'Galima pridėti tik vadovus arba komandos vadovus',
    'errors.notGroupMember': 'Nesate šios grupės narys',
    'errors.cannotCreateAlarmForUser':
      'Negalima sukurti žadintuvo šiam vartotojui',
    'errors.noAccessTrip': 'Nėra prieigos prie šio reiso',
    'errors.onlyCreatorEditAlarm': 'Tik kūrėjas gali redaguoti šį žadintuvą',
    'errors.noAccessAlarm': 'Nėra prieigos prie šio žadintuvo',
    'errors.noAccessChatSession': 'Nėra prieigos prie šios pokalbių sesijos',
    'errors.onlyDriverOrManagerChat':
      'Šiame pokalbyje rašyti gali tik dabartinis vairuotojas arba vadovas',
    'errors.messageNotEmpty': 'Žinutė negali būti tuščia',
    'errors.editOwnMessages': 'Galite redaguoti tik savo žinutes',
    'errors.cannotEditDeleted': 'Negalima redaguoti ištrintos žinutės',
    'errors.systemMessagesNotEditable': 'Sisteminių žinučių redaguoti negalima',
    'errors.editWindowPassed': 'Redagavimo laikas baigėsi (15 min)',
    'errors.cannotDeleteMessage': 'Negalite ištrinti šios žinutės',
    'errors.driverNotActive': 'Vairuotojo paskyra neaktyvi.',
    'errors.phoneFormat':
      'Telefonas turi būti tarptautiniu formatu, pvz. +380501234567',
    'errors.userExists':
      'Vartotojas su šiuo el. paštu ar telefonu jau egzistuoja.',
    'errors.phoneUsedDriver':
      'Šį telefono numerį jau naudoja kitas vairuotojas.',
    'errors.phoneUsedUser': 'Šį numerį jau naudoja kitas vartotojas.',
    'errors.scoreRange': 'Įvertinimas turi būti nuo 1 iki 5',
    'errors.companyExists': 'Įmonė tokiu pavadinimu jau sukurta',
    'errors.noAccess': 'Nėra prieigos',
    'errors.wrongEmailOrPassword': 'Neteisingas el. paštas arba slaptažodis',
    'errors.invalidOrExpiredToken': 'Neteisingas arba pasibaigęs tokenas',
    'errors.loginOrPasswordWrong':
      'Neteisingas prisijungimas arba slaptažodis',
    'errors.invalidToken': 'Neteisingas tokenas',
    'errors.codeInvalidOrExpired': 'Kodas neteisingas arba pasibaigęs.',
    'errors.tooManyAttempts': 'Per daug bandymų. Užsisakykite naują kodą.',
    'errors.pleaseWaitCode': 'Palaukite prieš prašydami naujo kodo.',
    'errors.linkInvalidOrExpired': 'Nuoroda negalioja arba pasibaigusi',
    'errors.userGoneOrDeactivated': 'Vartotojo nebėra arba jis deaktyvuotas',
    'errors.unsupportedEmoji': 'Nepalaikomas jaustukas',
    'errors.recordExists': 'Toks įrašas jau egzistuoja',
    'errors.recordNotFound': 'Įrašas nerastas',
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
    'errors.tripNotFound': 'Рейс не найден',
    'errors.documentNotFound': 'Документ не найден',
    'errors.groupNotFound': 'Группа не найдена',
    'errors.companyNotFound': 'Компания не найдена',
    'errors.userNotFound': 'Пользователь не найден',
    'errors.alarmNotFound': 'Будильник не найден',
    'errors.truckNotFound': 'Грузовик не найден',
    'errors.noteNotFound': 'Заметка не найдена',
    'errors.managerNotFound': 'Менеджер не найден',
    'errors.draftNotFound': 'Черновик не найден',
    'errors.announcementNotFound': 'Объявление не найдено',
    'errors.truckNotInGroup': 'Грузовик не найден в группе',
    'errors.managerNotInGroup': 'Менеджер не найден в группе',
    'errors.noOwnerForDriverGroup':
      'Нет менеджера/тимлида для создания группы водителей',
    'errors.messageNotFound': 'Сообщение не найдено',
    'errors.driverNotFound': 'Водитель не найден',
    'errors.sessionNotFound': 'Сессия не найдена',
    'errors.noActiveSession': 'Нет активной чат-сессии для этого рейса',
    'errors.editOwnAnnouncements': 'Можно редактировать только свои объявления',
    'errors.onlyAdminDeactivate':
      'Только администратор может деактивировать этого пользователя',
    'errors.noPermissionDeactivate':
      'У вас нет прав деактивировать этого пользователя',
    'errors.cannotDeleteDocument': 'Вы не можете удалить этот документ',
    'errors.onlyGroupMembersEdit':
      'Редактировать может только участник группы.',
    'errors.editOwnGroups': 'Можно редактировать только свои группы',
    'errors.onlyCreatorDeleteGroup': 'Удалить может только создатель группы',
    'errors.notTrucksGroup':
      'Это группа менеджеров — нельзя добавлять грузовики',
    'errors.notManagersGroup':
      'Это группа грузовиков — нельзя добавлять менеджеров',
    'errors.canAddManagersOnly':
      'Можно добавлять только менеджеров или тимлидов',
    'errors.notGroupMember': 'Вы не участник этой группы',
    'errors.cannotCreateAlarmForUser':
      'Нельзя создать будильник для этого пользователя',
    'errors.noAccessTrip': 'Нет доступа к этому рейсу',
    'errors.onlyCreatorEditAlarm':
      'Только создатель может редактировать этот будильник',
    'errors.noAccessAlarm': 'Нет доступа к этому будильнику',
    'errors.noAccessChatSession': 'Нет доступа к этой чат-сессии',
    'errors.onlyDriverOrManagerChat':
      'Только текущий водитель или менеджер могут писать в этот чат',
    'errors.messageNotEmpty': 'Сообщение не может быть пустым',
    'errors.editOwnMessages': 'Вы можете редактировать только свои сообщения',
    'errors.cannotEditDeleted': 'Нельзя редактировать удалённое сообщение',
    'errors.systemMessagesNotEditable': 'Системные сообщения не редактируются',
    'errors.editWindowPassed': 'Время на редактирование истекло (15 мин)',
    'errors.cannotDeleteMessage': 'Вы не можете удалить это сообщение',
    'errors.driverNotActive': 'Аккаунт водителя неактивен.',
    'errors.phoneFormat':
      'Номер должен быть в международном формате, напр. +380501234567',
    'errors.userExists':
      'Пользователь с таким email или телефоном уже существует.',
    'errors.phoneUsedDriver':
      'Этот номер телефона уже используется другим водителем.',
    'errors.phoneUsedUser':
      'Этот номер уже используется другим пользователем.',
    'errors.scoreRange': 'Оценка должна быть от 1 до 5',
    'errors.companyExists': 'Компания с таким названием уже создана',
    'errors.noAccess': 'Нет доступа',
    'errors.wrongEmailOrPassword': 'Неверный email или пароль',
    'errors.invalidOrExpiredToken': 'Неверный или просроченный токен',
    'errors.loginOrPasswordWrong': 'Логин или пароль неверны',
    'errors.invalidToken': 'Неверный токен',
    'errors.codeInvalidOrExpired': 'Код неверный или просрочен.',
    'errors.tooManyAttempts':
      'Слишком много попыток. Запросите новый код.',
    'errors.pleaseWaitCode': 'Подождите перед запросом нового кода.',
    'errors.linkInvalidOrExpired': 'Ссылка недействительна или устарела',
    'errors.userGoneOrDeactivated':
      'Пользователь больше не существует или деактивирован',
    'errors.unsupportedEmoji': 'Эмодзи не поддерживается',
    'errors.recordExists': 'Такая запись уже существует',
    'errors.recordNotFound': 'Запись не найдена',
  },
};

function resolve(lang?: string | null): Locale {
  const l = (lang ?? '').toLowerCase();
  return (SUPPORTED as readonly string[]).includes(l) ? (l as Locale) : 'uk';
}

/** True if `key` is a known catalog key in any locale (dedup: check UK). */
export function isMessageKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(messages.uk, key);
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
