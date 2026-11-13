/**
 * Начальные данные.
 *   npm run db:seed        — только админ и менеджер (безопасно для продакшена)
 *   npm run db:seed:demo   — плюс демо-специалисты, родители, записи и отзывы
 */
import './env';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { bookings, documents, messages, notifications, providers, reports, reviews, slots, users } from '../src/db/schema';
import { addDays, lastDateWithWeekday, todayStr, weekdayOf } from '../src/lib/dates';

const prod = process.env.NODE_ENV === 'production';

async function ensureUser(email: string, password: string, name: string, role: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: await bcrypt.hash(password, 10), name, role })
    .returning();
  return u;
}

async function seedStaff() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@momease.kz';
  const adminPass = process.env.ADMIN_PASSWORD;
  const managerEmail = process.env.MANAGER_EMAIL || 'manager@momease.kz';
  const managerPass = process.env.MANAGER_PASSWORD;
  if (prod && (!adminPass || !managerPass)) {
    throw new Error('В продакшене задайте ADMIN_PASSWORD и MANAGER_PASSWORD.');
  }
  await ensureUser(adminEmail, adminPass || 'ChangeMe-Admin-123', 'Администратор', 'admin');
  await ensureUser(managerEmail, managerPass || 'ChangeMe-Manager-123', 'Менеджер', 'manager');
  console.log(`Админ: ${adminEmail}, менеджер: ${managerEmail}`);
  if (!adminPass || !managerPass) {
    console.log('Использованы пароли по умолчанию (только для разработки): ChangeMe-Admin-123 / ChangeMe-Manager-123');
  }
}

type Demo = {
  kind: 'nanny' | 'club' | 'tutor';
  segment: string;
  name: string;
  title: string;
  bio: string;
  district: string;
  price: number;
  unit: 'hour' | 'session' | 'month';
  ageFrom: number;
  ageTo: number;
  verified: boolean;
  slots: [number, string][];
};

const DEMO: Demo[] = [
  { kind: 'nanny', segment: 'care_home', name: 'Айгерим К.', title: 'Айгерим К. — няня, 6 лет опыта', bio: 'Занимаюсь детьми от года, готовлю, гуляю, развиваю. Есть медицинская книжка.', district: 'esil', price: 1800, unit: 'hour', ageFrom: 1, ageTo: 7, verified: true, slots: [[0, '09:00'], [1, '09:00'], [3, '13:00'], [5, '11:00']] },
  { kind: 'nanny', segment: 'care_home', name: 'Динара С.', title: 'Динара С. — няня-воспитатель', bio: 'Педагогическое образование, занятия по развитию речи и подготовке к школе.', district: 'almaty', price: 2200, unit: 'hour', ageFrom: 3, ageTo: 8, verified: true, slots: [[1, '14:00'], [2, '14:00'], [4, '10:00']] },
  { kind: 'nanny', segment: 'evening_weekend', name: 'Мадина Е.', title: 'Мадина Е. — няня на вечер и выходные', bio: 'Выхожу вечером и по выходным, 3 года опыта.', district: 'saryarka', price: 1500, unit: 'hour', ageFrom: 2, ageTo: 10, verified: false, slots: [[4, '18:00'], [5, '15:00'], [6, '12:00']] },
  { kind: 'nanny', segment: 'after_school', name: 'Жанар Т.', title: 'Жанар Т. — няня для школьника', bio: 'Забираю из школы, кормлю обедом, помогаю с уроками.', district: 'baikonur', price: 1600, unit: 'hour', ageFrom: 6, ageTo: 11, verified: true, slots: [[0, '13:30'], [2, '13:30'], [4, '13:30']] },
  { kind: 'nanny', segment: 'care_home', name: 'Алия Б.', title: 'Алия Б. — няня для малышей', bio: 'Уход за детьми с рождения, опыт с младенцами.', district: 'esil', price: 2000, unit: 'hour', ageFrom: 0, ageTo: 3, verified: true, slots: [[0, '10:00'], [3, '10:00'], [5, '09:30']] },

  { kind: 'club', segment: 'stem', name: 'Робототехника «Кубик»', title: 'Робототехника «Кубик»', bio: 'Конструирование и программирование роботов, группы по 8 человек.', district: 'esil', price: 22000, unit: 'month', ageFrom: 7, ageTo: 12, verified: true, slots: [[0, '17:00'], [2, '17:00'], [5, '12:00']] },
  { kind: 'club', segment: 'art', name: 'Студия рисования «Акварель»', title: 'Студия рисования «Акварель»', bio: 'Живопись и рисунок в мини-группах, материалы включены.', district: 'almaty', price: 16000, unit: 'month', ageFrom: 4, ageTo: 9, verified: true, slots: [[1, '16:30'], [3, '16:30'], [5, '10:00']] },
  { kind: 'club', segment: 'sport', name: 'Бассейн «Дельфинёнок»', title: 'Бассейн «Дельфинёнок»', bio: 'Обучение плаванию с тренером в воде. Нужна медицинская справка.', district: 'saryarka', price: 28000, unit: 'month', ageFrom: 4, ageTo: 10, verified: true, slots: [[0, '18:00'], [2, '18:00'], [4, '18:00']] },
  { kind: 'club', segment: 'logic', name: 'Шахматный клуб «Ладья»', title: 'Шахматный клуб «Ладья»', bio: 'Секция с турнирами раз в месяц.', district: 'baikonur', price: 12000, unit: 'month', ageFrom: 6, ageTo: 14, verified: false, slots: [[1, '17:30'], [3, '17:30']] },
  { kind: 'club', segment: 'music', name: 'Вокальная студия «Нота»', title: 'Вокальная студия «Нота»', bio: 'Индивидуальные и групповые занятия вокалом.', district: 'esil', price: 20000, unit: 'month', ageFrom: 5, ageTo: 12, verified: true, slots: [[2, '16:00'], [5, '13:00']] },

  { kind: 'tutor', segment: 'languages', name: 'Самат Н.', title: 'Самат Н. — английский язык', bio: 'Разговорный английский и школьная программа, онлайн или очно.', district: 'esil', price: 4500, unit: 'session', ageFrom: 8, ageTo: 14, verified: true, slots: [[0, '17:30'], [1, '17:30'], [4, '17:00']] },
  { kind: 'tutor', segment: 'school_subjects', name: 'Ляззат О.', title: 'Ляззат О. — математика 5–9 классы', bio: 'Подтягиваю базу, готовлю к контрольным и олимпиадам.', district: 'almaty', price: 4000, unit: 'session', ageFrom: 11, ageTo: 15, verified: true, slots: [[1, '18:30'], [3, '18:30'], [5, '14:00']] },
  { kind: 'tutor', segment: 'languages', name: 'Аида М.', title: 'Аида М. — казахский язык', bio: 'Для начинающих и школьников, онлайн или очно.', district: 'saryarka', price: 3500, unit: 'session', ageFrom: 7, ageTo: 16, verified: false, slots: [[2, '17:00'], [4, '16:00']] },
  { kind: 'tutor', segment: 'school_prep', name: 'Гульнара Р.', title: 'Гульнара Р. — подготовка к школе', bio: 'Чтение, счёт, письмо, подготовка руки к письму.', district: 'esil', price: 3800, unit: 'session', ageFrom: 5, ageTo: 7, verified: true, slots: [[0, '16:00'], [2, '16:00'], [5, '11:00']] },
];

// Минимальный PDF для демо-документов (одна страница с текстом)
const DEMO_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 14 Tf 20 50 Td (Demo document) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF',
  'latin1',
);

const REVIEW_TEXTS = [
  'Ребёнок пошёл с удовольствием, всё чётко по времени.',
  'Очень внимательный специалист, рекомендую.',
  'Хорошо объясняет и находит подход к ребёнку.',
  'Всё понравилось, будем продолжать.',
];

/** Будущие записи, переписка, уведомления и одна жалоба, чтобы все разделы кабинетов были не пустыми */
async function seedActivity(parents: { id: number }[]) {
  const [p1] = await db.select().from(providers).where(eq(providers.status, 'approved')).orderBy(providers.id).limit(1);
  const s1 = await db.select().from(slots).where(eq(slots.providerId, p1.id)).orderBy(slots.id);
  const nextDate = (wd: number) => addDays(todayStr(), ((wd - weekdayOf(todayStr()) + 7) % 7) || 7);
  const [confirmed] = await db
    .insert(bookings)
    .values({ parentId: parents[0].id, providerId: p1.id, slotId: s1[1].id, date: nextDate(s1[1].weekday), status: 'confirmed' })
    .returning();
  const [pending] = await db
    .insert(bookings)
    .values({ parentId: parents[1].id, providerId: p1.id, slotId: s1[2].id, date: nextDate(s1[2].weekday), status: 'pending' })
    .returning();
  const [ownerRow] = await db.select({ id: providers.userId }).from(providers).where(eq(providers.id, p1.id));
  await db.insert(messages).values([
    { bookingId: confirmed.id, senderId: parents[0].id, body: 'Здравствуйте! Подскажите, пожалуйста, нужно ли что-то брать с собой?' },
    { bookingId: confirmed.id, senderId: ownerRow.id, body: 'Добрый день! Ничего не нужно, всё необходимое у меня есть. Буду вовремя.' },
    { bookingId: confirmed.id, senderId: parents[0].id, body: 'Спасибо, тогда до встречи!' },
  ]);
  await db.insert(notifications).values([
    { userId: ownerRow.id, type: 'booking_new', params: JSON.stringify({ who: 'Мадина', date: pending.date, time: s1[2].time }), link: '/dashboard' },
    { userId: parents[0].id, type: 'booking_confirmed', params: JSON.stringify({ who: p1.title, date: confirmed.date, time: s1[1].time }), link: '/dashboard' },
  ]);
  // демо-жалоба для раздела модерации
  const [target] = await db.select().from(providers).where(eq(providers.verified, false)).orderBy(providers.id).limit(1);
  if (target) {
    await db.insert(reports).values({
      reporterId: parents[2].id,
      targetType: 'provider',
      targetId: target.id,
      targetUserId: target.userId,
      reason: 'other',
      details: 'Демо-жалоба: в профиле не указан опыт работы.',
    });
  }
}

async function seedDemo() {
  const parents = [];
  for (const [i, name] of ['Асель', 'Мадина', 'Гульмира'].entries()) {
    parents.push(await ensureUser(`parent${i + 1}@demo.momease.kz`, 'demo12345', name, 'parent'));
  }
  let n = 0;
  for (const d of DEMO) {
    n += 1;
    const owner = await ensureUser(`${d.kind}${n}@demo.momease.kz`, 'demo12345', d.name, d.kind);
    const [existing] = await db.select().from(providers).where(eq(providers.userId, owner.id)).limit(1);
    if (existing) continue;
    const [p] = await db
      .insert(providers)
      .values({
        userId: owner.id,
        kind: d.kind,
        segment: d.segment,
        title: d.title,
        bio: d.bio,
        district: d.district,
        priceAmount: d.price,
        priceUnit: d.unit,
        ageFrom: d.ageFrom,
        ageTo: d.ageTo,
        status: 'approved',
        verified: d.verified,
        online: d.kind === 'tutor',
        trial: d.kind !== 'nanny' && d.price % 2000 === 0,
      })
      .returning();
    const created = await db
      .insert(slots)
      .values(d.slots.map(([weekday, time]) => ({ providerId: p.id, weekday, time })))
      .returning();
    // Проверенным специалистам добавляем принятый демо-документ
    if (d.verified) {
      await db.insert(documents).values({
        providerId: p.id,
        docType: d.kind === 'club' ? 'certificate' : 'resume',
        title: d.kind === 'club' ? 'Лицензия и сертификаты (демо)' : 'Резюме и диплом (демо)',
        fileName: 'demo-document.pdf',
        mime: 'application/pdf',
        size: DEMO_PDF.length,
        data: DEMO_PDF,
        status: 'accepted',
      });
    }
    // Пара завершённых записей с отзывами, чтобы в каталоге был рейтинг
    const howMany = 1 + (n % 3);
    const wd0 = d.slots[0][0];
    for (let k = 0; k < howMany; k++) {
      // завершённые занятия: прошлые даты нужного дня недели, неделя за неделей
      const date = lastDateWithWeekday(wd0, addDays(todayStr(), -1 - 7 * k));
      const [b] = await db
        .insert(bookings)
        .values({ parentId: parents[k % parents.length].id, providerId: p.id, slotId: created[0].id, date, status: 'completed' })
        .returning();
      await db.insert(reviews).values({
        bookingId: b.id,
        parentId: b.parentId,
        providerId: p.id,
        rating: 4 + ((n + k) % 2),
        text: REVIEW_TEXTS[(n + k) % REVIEW_TEXTS.length],
      });
    }
  }
  await seedActivity(parents);

  // Один специалист на модерации, чтобы менеджеру было что проверять
  const pendingOwner = await ensureUser('nanny-new@demo.momease.kz', 'demo12345', 'Салтанат Д.', 'nanny');
  const [hasProfile] = await db.select().from(providers).where(eq(providers.userId, pendingOwner.id)).limit(1);
  if (!hasProfile) {
    await db.insert(providers).values({
      userId: pendingOwner.id,
      kind: 'nanny',
      segment: 'evening_weekend',
      title: 'Салтанат Д. — няня',
      bio: 'Новый профиль, ждёт проверки менеджером.',
      district: 'baikonur',
      priceAmount: 1700,
      priceUnit: 'hour',
      ageFrom: 1,
      ageTo: 6,
      status: 'pending',
    });
    const [pp] = await db.select().from(providers).where(eq(providers.userId, pendingOwner.id)).limit(1);
    await db.insert(documents).values({
      providerId: pp.id,
      docType: 'resume',
      title: 'Резюме (демо, ждёт проверки)',
      fileName: 'demo-resume.pdf',
      mime: 'application/pdf',
      size: DEMO_PDF.length,
      data: DEMO_PDF,
      status: 'pending',
    });
  }
  console.log('Демо-данные созданы. Пароль всех демо-аккаунтов: demo12345');
  console.log('Родитель: parent1@demo.momease.kz, няня: nanny1@demo.momease.kz');
}

async function main() {
  await seedStaff();
  if (process.env.SEED_DEMO === '1') {
    if (prod) throw new Error('Демо-данные нельзя создавать в продакшене.');
    await seedDemo();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
