/**
 * Сквозная проверка бизнес-логики и прав доступа на чистой базе.
 * Запуск: npm run test:smoke
 */
process.env.PGLITE_DIR = process.env.PGLITE_DIR || '.data/smoke';
delete process.env.DATABASE_URL;

import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/pglite/migrator';

rmSync(process.env.PGLITE_DIR!, { recursive: true, force: true });

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`);
  }
}

async function throwsCode(fn: () => Promise<unknown>, code: string, name: string) {
  try {
    await fn();
    ok(false, `${name} (ожидалась ошибка ${code}, ошибки не было)`);
  } catch (e) {
    const got = (e as { code?: string }).code;
    ok(got === code, `${name} -> ${code}${got === code ? '' : ` (получили ${got ?? e})`}`);
  }
}

async function main() {
  const { db } = await import('../src/db');
  const { users } = await import('../src/db/schema');
  const svc = await import('../src/lib/services');
  const { eq } = await import('drizzle-orm');
  const chat = await import('../src/lib/chat');
  const reps = await import('../src/lib/reports');
  const nt = await import('../src/lib/notify');
  const { addDays, todayStr, weekdayOf } = await import('../src/lib/dates');
  const nextD = (wd: number) => addDays(todayStr(), ((wd - weekdayOf(todayStr()) + 7) % 7) || 7);
  const bcrypt = (await import('bcryptjs')).default;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: './drizzle' });

  console.log('Регистрация и вход');
  const parent = await svc.registerUser({ email: 'Mama@Test.kz', password: 'password123', name: 'Асель Нурланова', consent: true, role: 'parent' });
  const parent2 = await svc.registerUser({ email: 'mama2@test.kz', password: 'password123', name: 'Мадина', consent: true, role: 'parent' });
  const nanny = await svc.registerUser({ email: 'nanny@test.kz', password: 'password123', name: 'Айгерим', consent: true, role: 'nanny' });
  ok(parent.email === 'mama@test.kz', 'email приводится к нижнему регистру');
  await throwsCode(() => svc.registerUser({ email: 'mama@test.kz', password: 'password123', name: 'Дубль', consent: true, role: 'parent' }), 'exists', 'повторная регистрация');
  await throwsCode(() => svc.registerUser({ email: 'x@test.kz', password: 'short', name: 'Икс', consent: true, role: 'parent' }), 'fields', 'короткий пароль');
  await throwsCode(() => svc.registerUser({ email: 'adm@test.kz', password: 'password123', name: 'Хакер', consent: true, role: 'admin' }), 'fields', 'нельзя зарегистрироваться админом');
  await throwsCode(() => svc.registerUser({ email: 'mgr@test.kz', password: 'password123', name: 'Хакер', consent: true, role: 'manager' }), 'fields', 'нельзя зарегистрироваться менеджером');
  ok((await svc.authenticate('mama@test.kz', 'password123')).id === parent.id, 'вход с верным паролем');
  await throwsCode(() => svc.authenticate('mama@test.kz', 'wrong-password'), 'invalid', 'вход с неверным паролем');
  await throwsCode(() => svc.authenticate('nobody@test.kz', 'password123'), 'invalid', 'вход несуществующего пользователя');
  const [{ passwordHash }] = await db.select().from(users).where(eq(users.id, parent.id));
  ok(passwordHash !== 'password123' && (await bcrypt.compare('password123', passwordHash)), 'пароль хранится хэшем');

  // менеджер и админ создаются только вне регистрации
  const [manager] = await db.insert(users).values({ email: 'mgr@test.kz', passwordHash: await bcrypt.hash('password123', 10), name: 'Менеджер', role: 'manager' }).returning();
  const [admin] = await db.insert(users).values({ email: 'admin@test.kz', passwordHash: await bcrypt.hash('password123', 10), name: 'Админ', role: 'admin' }).returning();

  const asParent = { id: parent.id, role: 'parent' };
  const asParent2 = { id: parent2.id, role: 'parent' };
  const asNanny = { id: nanny.id, role: 'nanny' };
  const asManager = { id: manager.id, role: 'manager' };
  const asAdmin = { id: admin.id, role: 'admin' };

  console.log('Профиль специалиста и модерация');
  const provider = await svc.getProviderByUser(nanny.id);
  ok(!!provider && provider.status === 'pending', 'после регистрации профиль на модерации');
  ok((await svc.listProviders({})).length === 0, 'неодобренный профиль не виден в каталоге');
  ok((await svc.getProviderForViewer(provider!.id, null)) === null, 'гость не видит неодобренный профиль');
  ok((await svc.getProviderForViewer(provider!.id, asParent)) === null, 'чужой родитель не видит неодобренный профиль');
  ok((await svc.getProviderForViewer(provider!.id, asNanny)) !== null, 'владелец видит свой профиль');
  ok((await svc.getProviderForViewer(provider!.id, asManager)) !== null, 'менеджер видит профиль');
  await svc.updateProviderProfile(asNanny, { title: 'Айгерим — няня', segment: 'care_home', bio: 'Опыт 6 лет', district: 'esil', priceAmount: 1800, priceUnit: 'hour', ageFrom: 1, ageTo: 7 });
  await throwsCode(() => svc.updateProviderProfile(asNanny, { title: 'X', segment: 'care_home', bio: '', district: 'moon', priceAmount: 1, priceUnit: 'hour', ageFrom: 1, ageTo: 7 }), 'invalid', 'неверный район отклоняется');
  await throwsCode(() => svc.updateProviderProfile(asNanny, { title: 'Няня', segment: 'care_home', bio: '', district: 'esil', priceAmount: 1, priceUnit: 'hour', ageFrom: 9, ageTo: 3 }), 'invalid', 'возраст от > до отклоняется');
  await throwsCode(() => svc.updateProviderProfile(asNanny, { title: 'Няня', segment: 'sport', bio: '', district: 'esil', priceAmount: 1, priceUnit: 'hour', ageFrom: 1, ageTo: 7 }), 'invalid', 'няня не может выбрать направление «спорт»');
  await throwsCode(() => svc.updateProviderProfile(asParent, { title: 'Взлом', segment: 'care_home', bio: '', district: 'esil', priceAmount: 1, priceUnit: 'hour', ageFrom: 1, ageTo: 7 }), 'forbidden', 'родитель не может править профиль специалиста');
  await svc.addSlot(asNanny, { weekday: 0, time: '09:00' });
  await svc.addSlot(asNanny, { weekday: 2, time: '14:30' });
  await throwsCode(() => svc.addSlot(asNanny, { weekday: 0, time: '09:00' }), 'slot_exists', 'дубликат слота');
  await throwsCode(() => svc.addSlot(asNanny, { weekday: 9, time: '25:61' }), 'invalid', 'неверный слот');
  await throwsCode(() => svc.setProviderStatus(asParent, provider!.id, 'approved'), 'forbidden', 'родитель не модерирует');
  await throwsCode(() => svc.setProviderStatus(asNanny, provider!.id, 'approved'), 'forbidden', 'специалист не одобряет сам себя');
  await svc.setProviderStatus(asManager, provider!.id, 'approved');
  ok((await svc.listProviders({})).length === 1, 'после одобрения профиль виден в каталоге');

  console.log('Документы: сертификаты и резюме');
  const PDF = Buffer.from('%PDF-1.4\n%demo\n', 'latin1');
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  await throwsCode(() => svc.setVerified(asManager, provider!.id, true), 'no_documents', 'значок «Проверен» без документов выдать нельзя');
  await throwsCode(() => svc.addDocument(asParent, { docType: 'resume', title: 'Резюме', fileName: 'a.pdf', data: PDF }), 'forbidden', 'пользователь не загружает документы специалиста');
  await throwsCode(() => svc.addDocument(asNanny, { docType: 'resume', title: 'Резюме', fileName: 'a.pdf', data: Buffer.from('<script>alert(1)</script>') }), 'file_type', 'HTML под видом документа отклоняется');
  await throwsCode(() => svc.addDocument(asNanny, { docType: 'resume', title: 'Резюме', fileName: 'a.pdf', data: Buffer.alloc(0) }), 'file_empty', 'пустой файл отклоняется');
  await throwsCode(() => svc.addDocument(asNanny, { docType: 'resume', title: 'Резюме', fileName: 'a.pdf', data: Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]) }), 'file_too_big', 'файл больше 3 МБ отклоняется');
  await throwsCode(() => svc.addDocument(asNanny, { docType: 'passport', title: 'Резюме', fileName: 'a.pdf', data: PDF }), 'invalid', 'неверный тип документа');
  const doc1 = await svc.addDocument(asNanny, { docType: 'certificate', title: 'Сертификат первой помощи', fileName: 'cert.pdf', data: PDF });
  const doc2 = await svc.addDocument(asNanny, { docType: 'resume', title: 'Резюме', fileName: 'cv.png', data: PNG });
  ok((await svc.listDocuments(provider!.id)).length === 2 && (await svc.listDocuments(provider!.id)).every((d) => d.status === 'pending'), 'документы загружены и ждут проверки');
  ok((await svc.getDocumentFile(asNanny, doc1.id)).mime === 'application/pdf', 'владелец скачивает свой файл, тип определён по содержимому');
  ok((await svc.getDocumentFile(asManager, doc2.id)).mime === 'image/png', 'менеджер видит файл');
  await throwsCode(() => svc.getDocumentFile(asParent, doc1.id), 'not_found', 'пользователь не видит чужие документы');
  await throwsCode(() => svc.setDocumentStatus(asNanny, doc1.id, 'accepted'), 'forbidden', 'специалист не принимает свои документы');
  await throwsCode(() => svc.setDocumentStatus(asParent, doc1.id, 'accepted'), 'forbidden', 'пользователь не принимает документы');
  await throwsCode(() => svc.listDocumentsForStaff(asParent), 'forbidden', 'список всех документов только для команды');
  await svc.setDocumentStatus(asManager, doc1.id, 'accepted');
  await svc.setVerified(asManager, provider!.id, true);
  ok((await svc.listProviders({ verifiedOnly: true })).length === 1, 'фильтр «проверенные» работает');
  ok((await svc.listProviders({})).find((c) => c.id === provider!.id)!.verified, 'после принятого документа значок выдан');
  await svc.setDocumentStatus(asManager, doc1.id, 'rejected');
  ok(!(await svc.getProviderByUser(nanny.id))!.verified, 'если принятых документов не осталось, значок снимается');
  await svc.setDocumentStatus(asManager, doc1.id, 'accepted');
  await svc.setVerified(asManager, provider!.id, true);
  await svc.deleteDocument(asNanny, doc2.id);
  ok((await svc.listDocuments(provider!.id)).length === 1, 'специалист удалил свой документ');
  await throwsCode(() => svc.deleteDocument(asParent, doc1.id), 'forbidden', 'пользователь не удаляет документы');

  console.log('Сегменты и возраст');
  ok((await svc.listProviders({ segment: 'care_home' })).length === 1, 'фильтр по направлению работает');
  ok((await svc.listProviders({ segment: 'sport' })).length === 0, 'другое направление пусто');
  ok((await svc.listProviders({ age: '4-6' })).length === 1, 'возраст 4–6 подходит няне 1–7 лет');
  ok((await svc.listProviders({ age: '15-18' })).length === 0, 'возраст 15–18 не подходит');
  ok((await svc.listProviders({ age: '0-3', segment: 'care_home', kind: 'nanny' })).length === 1, 'фильтры работают вместе');
  ok((await svc.listProviders({ kind: 'club' })).length === 0, 'фильтр по типу работает');
  ok((await svc.listProviders({ district: 'esil' })).length === 1, 'фильтр по району работает');
  ok((await svc.listProviders({ district: 'saryarka' })).length === 0, 'фильтр по другому району пуст');

  console.log('Запись и отзывы');
  const slots = await svc.listProviderSlots(provider!.id);
  const d0 = nextD(slots[0].weekday);
  const d1 = nextD(slots[1].weekday);
  ok((await svc.listSlotsForDate(provider!.id, d0)).every((s) => !s.taken) && (await svc.listSlotsForDate(provider!.id, d0)).length === 1, 'на выбранную дату слот свободен');
  const booking = await svc.createBooking(asParent, slots[0].id, d0);
  ok(booking.status === 'pending' && booking.date === d0, 'запись создана в статусе «ожидает» на конкретную дату');
  await throwsCode(() => svc.createBooking(asParent2, slots[0].id, d0), 'slot_taken', 'второй родитель не может занять тот же слот в ту же дату');
  await throwsCode(() => svc.createBooking(asNanny, slots[1].id, d1), 'forbidden', 'специалист не может записываться');
  await throwsCode(() => svc.createBooking(asAdmin, slots[1].id, d1), 'forbidden', 'админ не записывается как родитель');
  await throwsCode(() => svc.createBooking(asParent, 999999, d1), 'not_found', 'несуществующий слот');
  ok((await svc.listSlotsForDate(provider!.id, d0)).find((s) => s.id === slots[0].id)!.taken, 'слот помечен занятым на эту дату');
  await throwsCode(() => svc.removeSlot(asNanny, slots[0].id), 'slot_has_booking', 'нельзя удалить слот с активной записью');
  await throwsCode(() => svc.cancelBooking(asParent2, booking.id), 'not_found', 'чужую запись отменить нельзя');
  await throwsCode(() => svc.respondBooking(asParent, booking.id, 'confirm'), 'forbidden', 'родитель не подтверждает запись');
  await throwsCode(() => svc.createReview(asParent, booking.id, { rating: 5, text: 'рано' }), 'bad_state', 'отзыв до подтверждения невозможен');
  await throwsCode(() => svc.respondBooking(asNanny, booking.id, 'complete'), 'bad_state', 'нельзя завершить неподтверждённую запись');
  await svc.respondBooking(asNanny, booking.id, 'confirm');
  await throwsCode(() => svc.createReview(asParent, booking.id, { rating: 5, text: 'до завершения' }), 'bad_state', 'отзыв по подтверждённой, но не завершённой записи невозможен');
  await svc.respondBooking(asNanny, booking.id, 'complete');
  await throwsCode(() => svc.createReview(asParent2, booking.id, { rating: 5, text: 'чужая' }), 'not_found', 'чужую запись оценить нельзя');
  await throwsCode(() => svc.createReview(asParent, booking.id, { rating: 9, text: '' }), 'invalid', 'оценка вне 1–5');
  await svc.createReview(asParent, booking.id, { rating: 5, text: 'Отлично!' });
  await throwsCode(() => svc.createReview(asParent, booking.id, { rating: 4, text: 'ещё раз' }), 'already_reviewed', 'второй отзыв на ту же запись');
  const card = (await svc.listProviders({}))[0];
  ok(card.ratingCount === 1 && card.ratingAvg === 5, 'рейтинг в каталоге посчитан');
  ok((await svc.listReviews(provider!.id))[0].parentName === 'Асель', 'в отзыве только имя без фамилии');
  await svc.cancelBooking(asParent, (await svc.createBooking(asParent, slots[1].id, d1)).id);
  ok((await svc.listSlotsForDate(provider!.id, d0)).every((s) => !s.taken), 'после отмены и завершения слоты свободны');
  ok((await svc.listParentBookings(parent.id)).length === 2, 'родитель видит свои записи');
  ok((await svc.listProviderBookings(provider!.id)).length === 2, 'специалист видит заявки');

  console.log('Права менеджера и администратора');
  await throwsCode(() => svc.setUserRole(asManager, parent2.id, 'manager'), 'forbidden', 'менеджер не меняет роли');
  await throwsCode(() => svc.setUserRole(asParent, parent2.id, 'admin'), 'forbidden', 'родитель не повышает себя до админа');
  await throwsCode(() => svc.setUserActive(asManager, parent2.id, false, 'причина'), 'forbidden', 'менеджер не отключает аккаунты');
  await throwsCode(() => svc.setUserRole(asAdmin, admin.id, 'parent'), 'own_account', 'админ не меняет собственную роль');
  await throwsCode(() => svc.setUserRole(asAdmin, nanny.id, 'parent'), 'fixed_role', 'роль специалиста менять нельзя');
  await throwsCode(() => svc.setUserRole(asAdmin, parent2.id, 'nanny'), 'invalid', 'нельзя назначить роль специалиста вручную');
  await svc.setUserRole(asAdmin, parent2.id, 'manager');
  ok((await svc.getUserById(parent2.id))!.role === 'manager', 'админ назначил менеджера');
  await svc.setUserActive(asAdmin, parent.id, false, 'тест блокировки');
  await throwsCode(() => svc.authenticate('mama@test.kz', 'password123'), 'disabled', 'отключённый аккаунт не входит');
  await svc.setUserActive(asAdmin, parent.id, true);
  ok((await svc.authenticate('mama@test.kz', 'password123')).id === parent.id, 'после включения вход снова работает');
  await svc.setUserActive(asAdmin, nanny.id, false, 'тест блокировки');
  ok((await svc.listProviders({})).length === 0, 'профиль отключённого пользователя скрыт из каталога');
  await throwsCode(() => svc.getStats(asManager), 'forbidden', 'менеджер не видит сводку админа');
  await throwsCode(() => svc.listUsers(asManager), 'forbidden', 'менеджер не видит список пользователей');
  await throwsCode(() => svc.listAllBookings(asParent), 'forbidden', 'пользователь не видит все записи');
  const stats = await svc.getStats(asAdmin);
  ok(stats.users === 5 && stats.providers === 1 && stats.bookings === 2, 'сводка админа считается');
  ok(stats.docsTotal === 1 && stats.verified === 1 && stats.reviews === 1, 'сводка включает документы, проверенных и отзывы');
  ok((await svc.listAllBookings(asAdmin)).length === 2 && (await svc.listUsers(asAdmin)).length === 5, 'админ видит все записи и всех пользователей');

  console.log('Календарь с датами');
  await svc.setUserActive(asAdmin, nanny.id, true);
  const nanny2 = await svc.registerUser({ email: 'nanny2@test.kz', password: 'password123', name: 'Динара', consent: true, role: 'nanny' });
  const parent3 = await svc.registerUser({ email: 'mama3@test.kz', password: 'password123', name: 'Гульмира Сериковна', consent: true, role: 'parent' });
  const asN2 = { id: nanny2.id, role: 'nanny' };
  const asP3 = { id: parent3.id, role: 'parent' };
  await svc.updateProviderProfile(asN2, { title: 'Динара — игры и английский', segment: 'evening_weekend', bio: 'Играем и учим английский', district: 'almaty', priceAmount: 2500, priceUnit: 'hour', ageFrom: 3, ageTo: 9 });
  const n2p = (await svc.getProviderByUser(nanny2.id))!;
  await svc.addSlot(asN2, { weekday: 1, time: '10:00' });
  await svc.addSlot(asN2, { weekday: 1, time: '11:00' });
  await svc.setProviderStatus(asManager, n2p.id, 'approved');
  const tue = nextD(1);
  const cal = await svc.getCalendar(n2p.id, 28);
  ok(cal.length === 28 && cal[0].date === todayStr(), 'календарь на 28 дней начинается с сегодняшней даты');
  ok(cal.filter((x) => x.free > 0).length >= 3 && cal.filter((x) => x.free > 0).every((x) => weekdayOf(x.date) === 1), 'свободные дни только во вторники');
  const tueSlots = await svc.listSlotsForDate(n2p.id, tue);
  ok(tueSlots.length === 2, 'на дату видны оба времени');
  ok((await svc.listSlotsForDate(n2p.id, addDays(tue, 1))).length === 0, 'в другой день недели времён нет');
  const b3 = await svc.createBooking(asP3, tueSlots[0].id, tue);
  await throwsCode(() => svc.createBooking(asParent, tueSlots[0].id, tue), 'slot_taken', 'то же время в ту же дату занято');
  const b4 = await svc.createBooking(asParent, tueSlots[0].id, addDays(tue, 7));
  ok(b4.date === addDays(tue, 7), 'то же время через неделю свободно');
  ok((await svc.getCalendar(n2p.id, 28)).find((x) => x.date === tue)!.free === 1, 'в календаре занятое время вычтено');
  await throwsCode(() => svc.createBooking(asParent, tueSlots[1].id, addDays(tue, 1)), 'invalid', 'дата другого дня недели отклоняется');
  await throwsCode(() => svc.createBooking(asParent, tueSlots[1].id, addDays(tue, -14)), 'past_date', 'прошедшая дата отклоняется');
  await throwsCode(() => svc.createBooking(asParent, tueSlots[1].id, addDays(tue, 70)), 'too_far', 'дата дальше 60 дней отклоняется');
  await throwsCode(() => svc.createBooking(asParent, tueSlots[1].id, '2026-13-45'), 'invalid', 'неверный формат даты');

  console.log('Поиск и сортировка');
  ok((await svc.listProviders({ q: 'английский' })).length === 1, 'поиск по описанию');
  ok((await svc.listProviders({ q: 'ДИНАРА' })).length === 1, 'поиск без учёта регистра');
  ok((await svc.listProviders({ q: 'английский игры' })).length === 1, 'несколько слов должны встретиться все');
  ok((await svc.listProviders({ q: 'английский спорт' })).length === 0, 'лишнее слово ничего не находит');
  ok((await svc.listProviders({ q: '%' })).length === 0 && (await svc.listProviders({ q: '_' })).length === 0, 'символы % и _ не работают как шаблон');
  const first = async (sort: string) => (await svc.listProviders({ sort }))[0].id;
  ok((await first('price_asc')) === provider!.id && (await first('price_desc')) === n2p.id, 'сортировка по цене');
  ok((await first('rating')) === provider!.id, 'сортировка по рейтингу: с отзывами выше');
  ok((await first('new')) === n2p.id && (await first('best')) === provider!.id, 'новые и лучшие');
  ok((await svc.listProviders({ sort: 'drop table' })).length === 2, 'неизвестная сортировка не ломает запрос');

  console.log('Чат');
  ok((await svc.listProviderBookings(n2p.id)).find((b) => b.id === b3.id)!.unread === 0, 'сначала непрочитанных нет');
  await chat.sendMessage(asP3, b3.id, 'Здравствуйте! Можно прийти с братом?');
  await chat.sendMessage(asP3, b3.id, 'И ещё вопрос про оплату');
  ok((await svc.listProviderBookings(n2p.id)).find((b) => b.id === b3.id)!.unread === 2, 'у специалиста 2 непрочитанных');
  const read = await chat.listMessages(asN2, b3.id);
  ok(read.rows.length === 2 && read.access.canWrite, 'специалист видит сообщения');
  ok((await svc.listProviderBookings(n2p.id)).find((b) => b.id === b3.id)!.unread === 0, 'после открытия чата всё прочитано');
  await chat.sendMessage(asN2, b3.id, 'Да, конечно');
  ok((await svc.listParentBookings(parent3.id))[0].unread === 1, 'у мамы 1 непрочитанное');
  await throwsCode(() => chat.sendMessage(asParent, b3.id, 'я посторонний'), 'not_found', 'посторонний не пишет в чужой чат');
  await throwsCode(() => chat.listMessages(asParent, b3.id), 'not_found', 'посторонний не читает чужой чат');
  await throwsCode(() => chat.listMessages(asManager, b3.id), 'not_found', 'менеджер не читает чат без жалобы');
  await throwsCode(() => chat.sendMessage(asP3, b3.id, '   '), 'invalid', 'пустое сообщение');
  await throwsCode(() => chat.sendMessage(asP3, b3.id, 'a'.repeat(1001)), 'invalid', 'слишком длинное сообщение');
  const msgNotes = (await nt.listNotifications(nanny2.id)).filter((n) => n.type === 'message_new' && !n.readAt);
  ok(msgNotes.length === 1, 'уведомления о сообщениях не множатся (одно на переписку)');
  await svc.respondBooking(asN2, b4.id, 'confirm');
  for (let i = 0; i < 15; i++) await chat.sendMessage(asParent, b4.id, `сообщение ${i}`);
  await throwsCode(() => chat.sendMessage(asParent, b4.id, 'лишнее'), 'rate_limited', 'не больше 15 сообщений в минуту');

  console.log('Жалобы и блокировки');
  await throwsCode(() => reps.createReport(asN2, { targetType: 'provider', targetId: n2p.id, reason: 'spam' }), 'own_target', 'на себя жаловаться нельзя');
  await throwsCode(() => reps.createReport(asP3, { targetType: 'provider', targetId: n2p.id, reason: 'взлом' }), 'invalid', 'неверная причина');
  await throwsCode(() => reps.createReport(asP3, { targetType: 'provider', targetId: 99999, reason: 'spam' }), 'not_found', 'жалоба на несуществующее');
  await throwsCode(() => reps.createReport(asParent, { targetType: 'chat', targetId: b3.id, reason: 'spam' }), 'not_found', 'на чужую переписку пожаловаться нельзя');
  await reps.createReport(asP3, { targetType: 'provider', targetId: n2p.id, reason: 'spam', details: 'проверка' });
  await throwsCode(() => reps.createReport(asP3, { targetType: 'provider', targetId: n2p.id, reason: 'fraud' }), 'already_reported', 'вторая открытая жалоба на то же отклоняется');
  await throwsCode(() => reps.listReports(asParent), 'forbidden', 'пользователь не видит жалобы');
  ok((await reps.listReports(asManager)).length === 1 && (await reps.countOpenReports(asManager)) === 1, 'менеджер видит открытую жалобу');
  ok((await nt.listNotifications(manager.id)).some((n) => n.type === 'report_new'), 'команда получила уведомление о жалобе');
  const r1 = (await reps.listReports(asManager))[0];
  await throwsCode(() => reps.resolveReport(asManager, r1.id, 'block_user', 'x'), 'forbidden', 'менеджер не блокирует аккаунты');
  await reps.resolveReport(asManager, r1.id, 'dismiss');
  await throwsCode(() => reps.resolveReport(asManager, r1.id, 'dismiss'), 'bad_state', 'закрытую жалобу повторно не закрыть');
  ok((await reps.listReports(asManager, 'closed')).length === 1 && (await reps.countOpenReports(asAdmin)) === 0, 'жалоба закрыта');
  ok((await nt.listNotifications(parent3.id)).some((n) => n.type === 'report_closed'), 'автор жалобы получил уведомление');

  // отзыв скрывается по жалобе и уходит из рейтинга
  const b5 = await svc.createBooking(asParent, tueSlots[0].id, addDays(tue, 14));
  await svc.respondBooking(asN2, b5.id, 'confirm');
  await svc.respondBooking(asN2, b5.id, 'complete');
  await svc.createReview(asParent, b5.id, { rating: 1, text: 'грубый текст' });
  ok((await svc.listProviders({ q: 'Динара' }))[0].ratingCount === 1, 'отзыв учтён в рейтинге');
  const rev = (await svc.listReviews(n2p.id))[0];
  await reps.createReport(asN2, { targetType: 'review', targetId: rev.id, reason: 'inappropriate' });
  const r2 = (await reps.listReports(asManager))[0];
  await throwsCode(() => reps.resolveReport(asManager, r2.id, 'reject_provider'), 'invalid', 'отзыв нельзя «снять с публикации» как профиль, если у автора нет профиля');
  await reps.resolveReport(asManager, r2.id, 'hide_review');
  ok((await svc.listReviews(n2p.id)).length === 0 && (await svc.listProviders({ q: 'Динара' }))[0].ratingCount === 0, 'скрытый отзыв пропал и не влияет на рейтинг');
  ok((await nt.listNotifications(parent.id)).some((n) => n.type === 'review_hidden'), 'автор скрытого отзыва уведомлён');

  // переписка открывается команде только после жалобы
  await reps.createReport(asP3, { targetType: 'chat', targetId: b3.id, reason: 'safety' });
  const staffRead = await chat.listMessages(asManager, b3.id);
  ok(staffRead.rows.length === 3 && staffRead.access.staffView && !staffRead.access.canWrite, 'после жалобы команда читает переписку, но писать не может');
  await throwsCode(() => chat.sendMessage(asManager, b3.id, 'вмешательство'), 'chat_closed', 'команда не пишет в чужой чат');
  await reps.resolveReport(asManager, (await reps.listReports(asManager))[0].id, 'resolve');

  // блокировка
  await throwsCode(() => svc.setUserActive(asAdmin, nanny2.id, false, ''), 'reason_required', 'для блокировки нужна причина');
  await reps.createReport(asP3, { targetType: 'provider', targetId: n2p.id, reason: 'fraud', details: 'повторно' });
  await reps.resolveReport(asAdmin, (await reps.listReports(asAdmin))[0].id, 'block_user', 'мошенничество');
  const blocked = await svc.getUserById(nanny2.id);
  ok(!blocked!.active && blocked!.blockedReason === 'мошенничество', 'аккаунт заблокирован, причина сохранена');
  await throwsCode(() => svc.authenticate('nanny2@test.kz', 'password123'), 'disabled', 'заблокированный не входит');
  ok((await svc.listProviders({ q: 'Динара' })).length === 0, 'профиль заблокированного скрыт из каталога');
  const afterBlock = (await svc.listParentBookings(parent.id)).find((b) => b.id === b4.id)!;
  ok(afterBlock.status === 'cancelled', 'активные записи заблокированного отменены');
  ok((await nt.listNotifications(parent.id)).some((n) => n.type === 'booking_cancelled'), 'вторая сторона уведомлена об отмене');
  await chat.sendMessage(asP3, b3.id, 'ответьте').then(() => ok(false, 'писать заблокированному нельзя'), (e) => ok(e.code === 'chat_closed', 'писать заблокированному нельзя'));
  await svc.setUserActive(asAdmin, nanny2.id, true);
  ok((await svc.getUserById(nanny2.id))!.blockedReason === null, 'при разблокировке причина очищается');

  console.log('Уведомления');
  const n2notes = await nt.listNotifications(nanny2.id);
  ok(n2notes.some((n) => n.type === 'booking_new' && JSON.parse(n.params).who === 'Гульмира Сериковна'), 'специалист получил уведомление о заявке');
  ok((await nt.listNotifications(parent3.id)).length >= 1, 'у мамы есть уведомления');
  ok((await nt.countUnreadNotifications(nanny2.id)) > 0, 'непрочитанные считаются');
  await nt.markAllNotificationsRead(nanny2.id);
  ok((await nt.countUnreadNotifications(nanny2.id)) === 0, 'после «отметить прочитанными» счётчик нулевой');
  ok((await nt.countUnreadNotifications(parent3.id)) > 0, 'чужие уведомления не затронуты');
  const v = nt.notifVars({ who: 'X', date: tue, time: '10:00' }, 'en');
  ok(String(v.when).includes('10:00') && String(v.when).length > 8, 'дата в уведомлении форматируется на языке читателя');

  console.log('Входящие сообщения');
  ok((await chat.countUnreadMessages(parent3.id)) === 1, 'счётчик непрочитанных у мамы');
  ok((await chat.countUnreadMessages(nanny2.id)) === (await chat.listChats({ id: nanny2.id, role: 'nanny' })).reduce((a, c) => a + c.unread, 0), 'счётчик в шапке совпадает с суммой по чатам');
  const inboxP = await chat.listChats(asP3);
  ok(inboxP.length >= 1 && inboxP[0].lastBody === 'Да, конечно' && inboxP[0].unread === 1, 'входящие мамы: последнее сообщение и непрочитанные');
  ok(inboxP[0].other.length > 0, 'в входящих мамы указан специалист');
  const inboxN = await chat.listChats(asN2);
  ok(inboxN.some((c) => c.other === 'Гульмира Сериковна'), 'в входящих специалиста указана мама, чат открывается в один клик');
  ok((await chat.listChats(asParent)).every((c) => c.id !== b3.id), 'чужие переписки во входящие не попадают');
  ok((await chat.listChats(asManager)).length === 0, 'у менеджера нет входящих');

  console.log('Поддержка');
  const sup = await import('../src/lib/support');
  const tk = await sup.createTicket(null, { name: 'Гость', email: 'guest@test.kz', topic: 'appeal', message: 'Прошу пересмотреть блокировку аккаунта' });
  ok(Boolean(tk?.id), 'гость может написать в поддержку');
  await throwsCode(() => sup.createTicket(null, { name: 'Г', email: 'bad', topic: 'question', message: 'коротко' }), 'invalid', 'неверные поля обращения');
  await throwsCode(() => sup.createTicket(null, { name: 'Гость', email: 'guest@test.kz', topic: 'hack', message: 'Достаточно длинное сообщение' }), 'invalid', 'неизвестная тема обращения');
  ok((await sup.listTickets(asManager, 'open')).length === 1, 'менеджер видит открытое обращение');
  ok((await sup.countOpenTickets(asAdmin)) === 1, 'счётчик открытых обращений');
  ok((await sup.countOpenTickets(asParent)) === 0, 'родителю счётчик не отдаётся');
  await throwsCode(() => sup.listTickets(asParent), 'forbidden', 'родитель не читает обращения');
  await throwsCode(() => sup.closeTicket(asParent, tk!.id), 'forbidden', 'родитель не закрывает обращения');
  ok((await nt.listNotifications(manager.id)).some((n) => n.type === 'ticket_new'), 'команда уведомлена об обращении');
  await sup.closeTicket(asManager, tk!.id);
  ok((await sup.countOpenTickets(asAdmin)) === 0 && (await sup.listTickets(asAdmin, 'closed')).length === 1, 'обращение закрыто');
  await throwsCode(() => sup.closeTicket(asManager, tk!.id), 'not_found', 'повторное закрытие');
  for (let i = 0; i < 4; i++) await sup.createTicket(null, { name: 'Спам', email: 'spam@test.kz', topic: 'other', message: 'Сообщение номер ' + i + ' для проверки' });
  await sup.createTicket(null, { name: 'Спам', email: 'spam@test.kz', topic: 'other', message: 'Пятое сообщение для проверки' });
  await throwsCode(() => sup.createTicket(null, { name: 'Спам', email: 'spam@test.kz', topic: 'other', message: 'Шестое сообщение для проверки' }), 'rate_limited', 'не больше 5 обращений в час с одного email');

  console.log('Онлайн и пробное занятие');
  ok((await svc.listProviders({ online: true })).length === 0 && (await svc.listProviders({ trial: true })).length === 0, 'по умолчанию онлайн и пробных нет');
  await svc.updateProviderProfile(asNanny, { title: 'Айгерим — няня', segment: 'care_home', bio: 'Опыт 6 лет', district: 'esil', priceAmount: 1800, priceUnit: 'hour', ageFrom: 1, ageTo: 7, online: true, trial: true });
  ok((await svc.listProviders({ online: true })).map((x) => x.id).includes(provider!.id), 'фильтр «онлайн» находит специалиста');
  ok((await svc.listProviders({ trial: true, online: true })).length === 1, 'фильтры «пробное» и «онлайн» сочетаются');
  ok((await svc.listProviders({ trial: true, kind: 'club' })).length === 0, 'фильтр «пробное» сочетается с типом');
  await svc.updateProviderProfile(asNanny, { title: 'Айгерим — няня', segment: 'care_home', bio: 'Опыт 6 лет', district: 'esil', priceAmount: 1800, priceUnit: 'hour', ageFrom: 1, ageTo: 7 });
  ok((await svc.listProviders({ online: true })).length === 0, 'без отметок специалист не попадает в «онлайн»');

  console.log('Избранное');
  const fv = await import('../src/lib/favorites');
  ok((await fv.toggleFavorite(asParent, provider!.id)) === true, 'родитель добавляет специалиста в избранное');
  ok((await fv.listFavorites(parent.id)).some((f) => f.id === provider!.id) && (await fv.isFavorite(parent.id, provider!.id)), 'специалист в списке избранного');
  ok((await fv.listFavorites(parent2.id)).length === 0, 'избранное чужого родителя не видно');
  ok((await fv.toggleFavorite(asParent, provider!.id)) === false && (await fv.listFavorites(parent.id)).length === 0, 'повторное нажатие убирает из избранного');
  await throwsCode(() => fv.toggleFavorite(asN2, provider!.id), 'forbidden', 'специалист не ведёт избранное');
  await throwsCode(() => fv.toggleFavorite(asParent, 99999), 'not_found', 'несуществующий специалист');
  await fv.toggleFavorite(asParent, provider!.id);
  await svc.setProviderStatus(asManager, provider!.id, 'rejected');
  ok((await fv.listFavorites(parent.id)).length === 0, 'снятый с публикации специалист пропадает из избранного');
  await svc.setProviderStatus(asManager, provider!.id, 'approved');

  console.log('Согласие на обработку данных');
  await throwsCode(() => svc.registerUser({ email: 'noconsent@test.kz', password: 'password123', name: 'Без согласия', role: 'parent' }), 'consent', 'без согласия регистрация невозможна');
  await throwsCode(() => svc.registerUser({ email: 'noconsent@test.kz', password: 'password123', name: 'Без согласия', consent: false, role: 'parent' }), 'consent', 'consent=false тоже отклоняется');
  const withC = await svc.registerUser({ email: 'consent@test.kz', password: 'password123', name: 'Со согласием', consent: 'on', role: 'parent' });
  const [cu] = await db.select().from(users).where(eq(users.id, withC.id));
  ok(cu.consentAt instanceof Date, 'дата согласия сохраняется');

  console.log('Защита от перебора пароля');
  for (let i = 0; i < 8; i++) {
    try { await svc.authenticate('brute@test.kz', 'bad'); } catch { /* ожидаемо */ }
  }
  await throwsCode(() => svc.authenticate('brute@test.kz', 'bad'), 'throttle', 'после 8 неудач вход блокируется');

  console.log(`\nИтого: ${passed} успешно, ${failed} с ошибкой`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
