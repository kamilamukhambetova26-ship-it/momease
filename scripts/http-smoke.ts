/**
 * Проверка уже запущенного сайта по HTTP: страницы, языки, доступ по ролям и
 * реальные действия через формы (server actions).
 *
 * Перед запуском: база с демо-данными (npm run db:seed:demo) и запущенный сервер
 *   AUTH_SECRET=... npm start -- -p 3100
 *   AUTH_SECRET=... BASE=http://localhost:3100 npx tsx scripts/http-smoke.ts
 *
 * Скрипт не открывает БД, только подписывает сессии тем же AUTH_SECRET.
 * ID пользователей берутся из .data/test-ids.json (его пишет scripts/ids.ts).
 * Проще всего запускать всё одной командой: bash scripts/run-http-smoke.sh
 */
import { readFileSync } from 'node:fs';
import { signSessionToken } from '../src/lib/token';

const BASE = process.env.BASE || 'http://localhost:3100';
let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name}`); }
}

type Opts = { cookie?: string; lang?: string; theme?: string; acceptLanguage?: string };
function headers(o: Opts = {}) {
  const parts: string[] = [];
  if (o.cookie) parts.push(`momease_session=${o.cookie}`);
  if (o.lang) parts.push(`momease_lang=${o.lang}`);
  if (o.theme) parts.push(`momease_theme=${o.theme}`);
  const h: Record<string, string> = {};
  if (parts.length) h.cookie = parts.join('; ');
  if (o.acceptLanguage) h['accept-language'] = o.acceptLanguage;
  return h;
}
async function get(path: string, o: Opts = {}) {
  const res = await fetch(BASE + path, { headers: headers(o), redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') ?? '', text: await res.text(), res };
}

type Form = { html: string; fields: Record<string, string> };
function unescapeHtml(v: string) {
  return v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function forms(html: string): Form[] {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => {
    const fields: Record<string, string> = {};
    for (const i of m[0].matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = /name="([^"]*)"/.exec(i[0])?.[1];
      const value = unescapeHtml(/value="([^"]*)"/.exec(i[0])?.[1] ?? '');
      if (name) fields[name] = value;
    }
    return { html: m[0], fields };
  });
}
async function post(path: string, form: Form, extra: Record<string, string>, o: Opts = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...form.fields, ...extra })) fd.set(k, v);
  const res = await fetch(BASE + path, { method: 'POST', body: fd, headers: headers(o), redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location') ?? '', res, text };
}

async function main() {
  const ids = JSON.parse(readFileSync('.data/test-ids.json', 'utf8')) as Record<string, number>;
  const tok = async (id: number) => signSessionToken(id);
  const admin = await tok(ids.admin), manager = await tok(ids.manager), parent = await tok(ids.parent1), parent2 = await tok(ids.parent2), nanny = await tok(ids.nanny1);
  const pendingId = ids.pendingProvider;

  console.log('Публичные страницы и языки');
  let r = await get('/');
  ok(r.status === 200 && r.text.includes('Няни, кружки и репетиторы рядом с домом'), 'главная на русском по умолчанию');
  ok(['RU', 'ҚАЗ', 'EN'].every((l) => r.text.includes(`>${l}</button>`)), 'переключатель RU / ҚАЗ / EN есть вверху страницы');
  ok(r.text.includes('class="site-header"') && r.text.indexOf('class="logo"') < r.text.indexOf('class="langs"'), 'вверху: слева название, справа языки и тема');
  ok(r.text.includes('class="theme-btn"'), 'переключатель темы есть в шапке');
  for (const lang of ['ru', 'kk', 'en']) {
    const page = await get('/', { lang });
    ok(/class="logo"[^>]*>[\s\S]*?momease<\/a>/.test(page.text), `название momease не меняется при языке ${lang}`);
  }
  ok(r.text.includes('Кто мы') && r.text.includes('Что мы делаем') && r.text.includes('id="about"'), 'на главной есть описание платформы: кто мы, что делаем, как работает');
  r = await get('/', { lang: 'kk' });
  ok(r.text.includes('Біз кімбіз') && r.text.includes('Не істейміз'), 'описание платформы на казахском');
  r = await get('/', { lang: 'en' });
  ok(r.text.includes('Who we are') && r.text.includes('What we do'), 'описание платформы на английском');
  r = await get('/');
  r = await get('/', { lang: 'kk' });
  ok(r.text.includes('Үйіңізге жақын күтушілер') && r.text.includes('<html lang="kk"'), 'казахский язык по cookie');
  r = await get('/', { lang: 'en' });
  ok(r.text.includes('Nannies, clubs and tutors near your home') && r.text.includes('<html lang="en"'), 'английский язык по cookie');
  r = await get('/', { acceptLanguage: 'en-US,en;q=0.9' });
  ok(r.text.includes('Nannies, clubs and tutors'), 'язык браузера en подхватывается без cookie');
  r = await get('/', { acceptLanguage: 'kk-KZ,kk;q=0.9' });
  ok(r.text.includes('Үйіңізге жақын'), 'язык браузера kk подхватывается без cookie');
  r = await get('/', { lang: 'xx' });
  ok(r.text.includes('Няни, кружки'), 'неизвестный язык откатывается на русский');

  r = await get('/');
  const langForm = forms(r.text).find((f) => f.html.includes('name="lang"'))!;
  const sw = await post('/', langForm, { lang: 'kk' });
  ok((sw.res.headers.get('set-cookie') ?? '').includes('momease_lang=kk'), 'кнопка языка ставит cookie через server action');

  console.log('Тема, сегменты и возраст');
  ok(r.text.includes('data-theme="light"'), 'по умолчанию светлая тема');
  ok((await get('/', { theme: 'dark' })).text.includes('data-theme="dark"'), 'тёмная тема по cookie');
  const themeForm = forms(r.text).find((f) => f.html.includes('name="theme"'))!;
  const th = await post('/', themeForm, { theme: 'dark' });
  ok((th.res.headers.get('set-cookie') ?? '').includes('momease_theme=dark'), 'кнопка темы ставит cookie через server action');
  const bad = await post('/', themeForm, { theme: '<script>' });
  ok((bad.res.headers.get('set-cookie') ?? '').includes('momease_theme=light'), 'неизвестная тема откатывается на светлую');
  r = await get('/?segment=sport');
  ok(r.text.includes('Бассейн') && !r.text.includes('Робототехника «Кубик»') && !r.text.includes('Айгерим'), 'каталог фильтруется по направлению');
  r = await get('/?age=0-3');
  ok(r.text.includes('Айгерим') && !r.text.includes('Самат Н.'), 'фильтр возраста 0–3 показывает только подходящих');
  r = await get('/?age=15-18');
  ok(r.text.includes('Аида М.') && !r.text.includes('Айгерим'), 'фильтр возраста 15–18');
  r = await get('/?cat=nanny&segment=sport');
  ok(r.status === 200 && r.text.includes('Айгерим'), 'направление, не подходящее типу, игнорируется');
  r = await get('/', { lang: 'en' });
  ok(r.text.includes('Care at home') && r.text.includes('0–3 years'), 'направления и возрастные группы переведены');

  r = await get('/?cat=club');
  ok(r.text.includes('Робототехника «Кубик»') && !r.text.includes('Айгерим'), 'каталог фильтруется по типу из БД');
  r = await get('/?cat=nanny&district=baikonur');
  ok(r.text.includes('Жанар') && !r.text.includes('Айгерим'), 'каталог фильтруется по району');
  r = await get('/?cat=nanny&verified=1');
  ok(!r.text.includes('Мадина Е.') && r.text.includes('Айгерим'), 'фильтр «только проверенные» скрывает непроверенных');
  r = await get('/provider/1');
  ok(r.status === 200 && r.text.includes('Айгерим'), 'страница специалиста открывается');
  ok(r.text.includes('Войдите как пользователь'), 'гость видит приглашение войти, а не кнопку записи');
  ok((await get('/provider/99999')).status === 404, 'несуществующий специалист -> 404');
  ok((await get(`/provider/${pendingId}`)).status === 404, 'профиль на модерации скрыт от гостя');
  ok((await get(`/provider/${pendingId}`, { cookie: manager })).status === 200, 'профиль на модерации виден менеджеру');
  ok((await get('/login')).status === 200 && (await get('/register?type=worker')).status === 200 && (await get('/register?role=club')).status === 200, 'страницы входа и регистрации');
  r = await get('/register');
  ok(r.text.includes('Что такое momease') && r.text.includes('Кто мы') && r.text.includes('Специалист') && r.text.includes('Пользователь'), 'на регистрации есть описание платформы и выбор «пользователь / специалист»');
  ok((await get('/login')).text.includes('Что такое momease'), 'на странице входа есть описание платформы');

  console.log('Доступ в кабинет');
  r = await get('/dashboard');
  ok(r.status === 307 && r.location.startsWith('/login'), 'без входа кабинет перенаправляет на /login');
  r = await get('/dashboard', { cookie: 'garbage.token.value' });
  ok(r.status === 307 && r.location.includes('/login'), 'поддельная cookie не пускает');
  const forged = await (async () => {
    const { SignJWT } = await import('jose');
    return new SignJWT({ uid: 1 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode('wrong-secret-wrong-secret-wrong-secret'));
  })();
  r = await get('/dashboard', { cookie: forged });
  ok(r.status === 307 && r.location.includes('/login'), 'токен с чужим секретом не пускает');

  console.log('Кабинеты по ролям');
  r = await get('/dashboard', { cookie: parent });
  ok(r.status === 200 && r.text.includes('Мои записи'), 'родитель видит свои записи');
  ok(!r.text.includes('Профили на проверке') && !r.text.includes('<h2>Пользователи</h2>') && !r.text.includes('Моё расписание'), 'родитель не видит панели менеджера, админа и специалиста');
  r = await get('/dashboard', { cookie: parent, lang: 'kk' });
  ok(r.text.includes('Менің жазылуларым'), 'кабинет родителя на казахском');
  r = await get('/dashboard', { cookie: nanny });
  ok(r.text.includes('Моё расписание') && r.text.includes('Заявки') && !r.text.includes('Профили на проверке') && !r.text.includes('Мои записи'), 'специалист видит только свой кабинет');
  r = await get('/dashboard', { cookie: manager });
  ok(r.text.includes('Профили на проверке') && !r.text.includes('<h2>Пользователи</h2>'), 'менеджер видит модерацию, но не пользователей');
  r = await get('/dashboard', { cookie: admin });
  ok(r.text.includes('Сводка') && r.text.includes('data-role="admin"') && r.text.includes('Документов на проверке'), 'админ видит сводку со статистикой и документами');
  r = await get('/dashboard?tab=users', { cookie: admin });
  ok(r.text.includes('<h2>Пользователи</h2>') && r.text.includes('parent1@demo.momease.kz') && r.text.includes('Телефон'), 'админ видит всех пользователей с контактами');
  r = await get('/dashboard?tab=providers', { cookie: admin });
  ok(r.text.includes('Профили на проверке') && r.text.includes('Документы на проверке'), 'админ видит вкладку специалистов с модерацией и документами');
  r = await get('/dashboard?tab=bookings', { cookie: admin });
  ok(r.status === 200 && r.text.includes('Записи'), 'админ видит вкладку записей');
  r = await get('/dashboard?tab=users', { cookie: parent });
  ok(!r.text.includes('parent1@demo.momease.kz') && !r.text.includes('Телефон'), 'параметр tab не открывает данные админа обычному пользователю');
  r = await get('/dashboard?tab=users', { cookie: manager });
  ok(!r.text.includes('<h2>Пользователи</h2>'), 'менеджер не видит пользователей даже через ?tab=users');
  ok((await get('/dashboard', { cookie: parent })).text.includes('data-role="parent"') && (await get('/dashboard', { cookie: nanny })).text.includes('data-role="provider"'), 'у пользователя и специалиста разные интерфейсы');

  console.log('Действия через формы');
  r = await get('/provider/1', { cookie: parent });
  const bookForm = forms(r.text).find((f) => 'slotId' in f.fields)!;
  ok(!!bookForm, 'родитель видит кнопку записи');
  let a = await post('/provider/1', bookForm, {}, { cookie: parent });
  ok(a.status === 303 && a.location.includes('/dashboard?msg=booked'), 'родитель записался на слот');
  a = await post('/provider/1', bookForm, {}, { cookie: parent2 });
  ok(a.location.includes('/provider/1') && a.location.includes('msg=slot_taken'), 'второй родитель получает «слот занят»');
  a = await post('/provider/1', bookForm, {});
  ok(a.status !== 200 && a.location.includes('/login'), 'без входа записаться нельзя');

  r = await get('/dashboard', { cookie: nanny });
  const confirmForm = forms(r.text).filter((f) => f.fields.action === 'confirm').sort((x, y) => Number(y.fields.bookingId) - Number(x.fields.bookingId))[0]!; // самая новая заявка = созданная в этом тесте
  ok(!!confirmForm, 'специалист видит заявку с кнопкой «Подтвердить»');
  a = await post('/dashboard', confirmForm, {}, { cookie: parent });
  ok(a.location.includes('msg=forbidden'), 'родитель не может подтвердить чужую заявку (forbidden)');
  a = await post('/dashboard', confirmForm, {}, { cookie: nanny });
  ok(a.location.includes('msg=updated'), 'специалист подтвердил запись');
  r = await get('/dashboard', { cookie: parent });
  ok(r.text.includes('Подтверждена') && !r.text.includes('Оставить отзыв'), 'до завершения формы отзыва нет');
  r = await get('/dashboard', { cookie: nanny });
  const doneForm = forms(r.text).find((f) => f.fields.action === 'complete' && f.fields.bookingId === confirmForm.fields.bookingId)!;
  ok(!!doneForm, 'специалист видит кнопку «Выполнено»');
  a = await post('/dashboard', doneForm, {}, { cookie: nanny });
  ok(a.location.includes('msg=updated'), 'специалист завершил запись');
  r = await get('/dashboard', { cookie: parent });
  ok(r.text.includes('Оставить отзыв'), 'после завершения родитель видит форму отзыва');
  const reviewForm = forms(r.text).find((f) => 'bookingId' in f.fields && f.html.includes('name="rating"'))!;
  a = await post('/dashboard', reviewForm, { rating: '5', text: 'Отличная няня, спасибо!' }, { cookie: parent });
  ok(a.location.includes('msg=reviewed'), 'родитель оставил отзыв');
  r = await get('/provider/1');
  ok(r.text.includes('Отличная няня, спасибо!'), 'отзыв виден всем на странице специалиста');

  r = await get('/dashboard', { cookie: manager });
  const approveForm = forms(r.text).find((f) => f.fields.providerId === String(pendingId) && f.fields.status === 'approved')!;
  ok(!!approveForm, 'менеджер видит кнопку «Опубликовать» для профиля на модерации');
  a = await post('/dashboard', approveForm, {}, { cookie: parent });
  ok(a.location.includes('msg=forbidden'), 'родитель не может одобрить профиль');
  a = await post('/dashboard', approveForm, {}, { cookie: manager });
  ok(a.location.includes('msg=updated'), 'менеджер одобрил профиль');
  ok((await get(`/provider/${pendingId}`)).status === 200, 'одобренный профиль стал виден гостям');

  r = await get('/dashboard?tab=users', { cookie: admin });
  const roleForm = forms(r.text).find((f) => f.fields.userId === String(ids.parent3) && f.html.includes('name="role"'))!;
  ok(!!roleForm, 'админ видит форму смены роли');
  a = await post('/dashboard', roleForm, { role: 'manager' }, { cookie: manager });
  ok(a.location.includes('msg=forbidden'), 'менеджер не может менять роли');
  a = await post('/dashboard', roleForm, { role: 'admin' }, { cookie: parent });
  ok(a.location.includes('msg=forbidden'), 'родитель не может сделать себя админом');
  a = await post('/dashboard', roleForm, { role: 'manager' }, { cookie: admin });
  ok(a.location.includes('msg=updated'), 'админ назначил менеджера');

  console.log('Регистрация и вход через формы');
  let newSessionForNav: string | undefined;
  const sessionOf = (res: Response) => /momease_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  r = await get('/register');
  const regForm = forms(r.text).find((f) => f.html.includes('name="email"') && f.html.includes('name="role"'))!;
  const email = `new-${Date.now()}@test.kz`;
  a = await post('/register', regForm, { role: 'parent', name: 'Новая Мама', email, phone: '', password: 'short' });
  ok(a.status === 200 && a.text.includes('Проверьте поля формы'), 'регистрация с коротким паролем показывает ошибку');
  a = await post('/register', regForm, { role: 'admin', name: 'Хакер Админ', email, phone: '', password: 'password123' });
  ok(a.status === 200 && a.text.includes('Проверьте поля формы'), 'регистрация с ролью admin отклоняется');
  a = await post('/register', regForm, { role: 'parent', name: 'Новая Мама', email, phone: '', password: 'password123' });
  ok(a.status === 200 && a.text.includes('принять правила'), 'без согласия регистрация отклоняется с понятным сообщением');
  a = await post('/register', regForm, { role: 'parent', name: 'Новая Мама', email, phone: '', password: 'password123', consent: 'on' });
  const newSession = sessionOf(a.res);
  newSessionForNav = newSession;
  ok(a.status === 303 && a.location.includes('/dashboard') && !!newSession, 'регистрация создаёт аккаунт и сессию');
  r = await get('/dashboard', { cookie: newSession });
  ok(r.status === 200 && r.text.includes('Новая Мама') && r.text.includes('Мои записи'), 'новый родитель попадает в свой кабинет');
  a = await post('/register', regForm, { role: 'parent', name: 'Новая Мама', email, phone: '', password: 'password123', consent: 'on' });
  ok(a.status === 200 && a.text.includes('уже зарегистрирован'), 'повторный email отклоняется');
  a = await post('/register', regForm, { role: 'club', name: 'Студия «Радуга»', email: `club-${Date.now()}@test.kz`, phone: '', password: 'password123', consent: 'on' });
  const clubSession = sessionOf(a.res);
  r = await get('/dashboard', { cookie: clubSession });
  ok(r.text.includes('Моё расписание') && r.text.includes('На модерации'), 'новый кружок создаёт профиль на модерации');

  console.log('FAQ, поддержка, правила, навигация');
  for (const [path, needle] of [['/faq', 'Частые вопросы'], ['/policy', 'Правила платформы'], ['/privacy', 'О персональных данных'], ['/support', 'Поддержка']] as const) {
    r = await get(path);
    ok(r.status === 200 && r.text.includes(needle), `страница ${path} открыта гостю`);
  }
  r = await get('/policy');
  ok(r.text.includes('блокир') && r.text.includes('жалоб') && r.text.includes('/support?topic=appeal'), 'правила описывают жалобы и блокировки и ведут к обжалованию');
  r = await get('/');
  ok(r.text.includes('href="#main"') && r.text.includes('id="main"'), 'есть ссылка «перейти к содержимому»');
  ok(r.text.indexOf('href="/login"') > r.text.indexOf('class="langs"'), 'вход и регистрация справа: после языков и темы');
  ok(r.text.includes('href="/faq"') && r.text.includes('href="/policy"') && r.text.includes('href="/privacy"') && r.text.includes('href="/support"'), 'в шапке и подвале есть ссылки на FAQ, правила, конфиденциальность, поддержку');
  ok(!/необязательно|\(optional\)|міндетті емес/.test(r.text + (await get('/register')).text), 'слова «необязательно» нет');
  ok((r.res.headers.get('strict-transport-security') ?? '').includes('max-age') && r.res.headers.get('x-content-type-options') === 'nosniff' && r.res.headers.get('x-frame-options') === 'DENY', 'заголовки безопасности (HSTS, nosniff, frame)');
  for (const [lang, word] of [['kk', 'Жиі қойылатын'], ['en', 'Frequently asked']] as const) {
    r = await get('/faq', { lang });
    ok(r.text.includes(word), `FAQ на языке ${lang}`);
  }
  r = await get('/');
  ok(r.text.includes('class="side-nav"') && r.text.includes('href="/dashboard"') === false && r.text.includes('href="/#search"'), 'справа навигация: гостю вход, регистрация, специалисты');
  r = await get('/', { cookie: newSessionForNav });
  ok(r.text.includes('class="side-nav"') && r.text.includes('href="/dashboard"') && r.text.includes('href="/messages"') && r.text.includes('href="/notifications"'), 'справа навигация: пользователю профиль, сообщения, уведомления');
  r = await get('/provider/1', { cookie: newSessionForNav });
  const favForm = forms(r.text).find((f) => f.html.includes('name="providerId"') && f.html.includes('aria-pressed'));
  ok(Boolean(favForm) && r.text.includes('В избранное'), 'у родителя на странице специалиста есть кнопка «В избранное»');
  if (favForm) {
    a = await post('/provider/1', favForm, {}, { cookie: newSessionForNav });
    ok(a.location.includes('msg=favorite_saved'), 'добавление в избранное');
    r = await get('/dashboard', { cookie: newSessionForNav });
    ok(r.text.includes('Избранные специалисты') && r.text.includes('♥'), 'избранное видно в кабинете');
  }
  r = await get('/provider/1');
  ok(!r.text.includes('В избранное'), 'гостю кнопка избранного не показывается');
  r = await get('/?online=1');
  ok(r.status === 200 && r.text.includes('Пробное занятие') && r.text.includes('Онлайн'), 'на главной есть фильтры «Онлайн» и «Пробное занятие»');
  r = await get('/?online=1&trial=1');
  ok(r.status === 200, 'фильтры online и trial в адресе работают');
  r = await get('/messages');
  ok(r.status === 307 || r.status === 302 || r.status === 303, '«Сообщения» без входа ведут на вход');
  r = await get('/login');
  const loginForm = forms(r.text).find((f) => f.html.includes('name="password"'))!;
  a = await post('/login', loginForm, { email: 'admin@momease.kz', password: 'wrong-password', next: '/dashboard' });
  ok(a.status === 200 && a.text.includes('Неверный email или пароль'), 'неверный пароль показывает ошибку и не создаёт сессию');
  ok(!sessionOf(a.res), 'при ошибке входа cookie не выдаётся');
  a = await post('/login', loginForm, { email: 'admin@momease.kz', password: 'ChangeMe-Admin-123', next: '/dashboard' });
  ok(a.status === 303 && !!sessionOf(a.res), 'админ входит по email и паролю');
  r = await get('/dashboard', { cookie: sessionOf(a.res) });
  ok(r.text.includes('Сводка') && r.text.includes('Пользователей'), 'после входа админ попадает в кабинет со статистикой');
  a = await post('/login', loginForm, { email: 'admin@momease.kz', password: 'ChangeMe-Admin-123', next: 'https://evil.example/' });
  ok(a.status === 303 && a.location.startsWith('/') && !a.location.includes('evil.example'), 'чужой адрес в next игнорируется');
  r = await get('/login', { cookie: sessionOf(a.res) });
  ok(r.status === 307, 'залогиненного со страницы входа отправляет дальше');
  r = await get('/');
  const logoutHtml = await get('/', { cookie: sessionOf(a.res) });
  const logoutForm = forms(logoutHtml.text).find((f) => f.html.includes('Выйти'))!;
  a = await post('/', logoutForm, {}, { cookie: sessionOf(a.res) });
  ok(a.status === 303 && (a.res.headers.get('set-cookie') ?? '').includes('momease_session=;'), 'выход удаляет сессию');

  console.log('Документы специалиста (сертификаты и резюме)');
  r = await get('/dashboard', { cookie: nanny });
  ok(r.text.includes('Сертификаты и резюме') && r.text.includes('type="file"'), 'специалист видит форму загрузки сертификатов и резюме');
  const ownDocId = /\/api\/documents\/(\d+)/.exec(r.text)?.[1];
  ok(!!ownDocId, 'специалист видит свой документ в списке');
  const upForm = forms(r.text).find((f) => f.html.includes('name="file"'))!;
  const upload = async (o: Opts, name: string, type: string, bytes: string, title = 'Мой сертификат') => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(upForm.fields)) fd.set(k, v);
    fd.set('docType', 'certificate');
    fd.set('title', title);
    fd.set('file', new Blob([bytes], { type }), name);
    const res = await fetch(BASE + '/dashboard', { method: 'POST', body: fd, headers: headers(o), redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location') ?? '' };
  };
  let up = await upload({ cookie: nanny }, 'evil.pdf', 'application/pdf', '<html><script>alert(1)</script></html>');
  ok(up.location.includes('msg=file_type'), 'HTML под видом PDF отклоняется');
  up = await upload({ cookie: nanny }, 'cert.pdf', 'application/pdf', '%PDF-1.4\nтест\n');
  ok(up.location.includes('msg=doc_added'), 'специалист загрузил сертификат (PDF)');
  up = await upload({ cookie: parent }, 'cert.pdf', 'application/pdf', '%PDF-1.4\n');
  ok(up.location.includes('msg=forbidden'), 'обычный пользователь не может загружать документы специалиста');

  r = await get('/dashboard', { cookie: nanny });
  ok(r.text.includes('Мой сертификат') && r.text.includes('На проверке'), 'новый документ ждёт проверки');
  const newDocId = [...r.text.matchAll(/\/api\/documents\/(\d+)/g)].map((m) => m[1]).sort((x, y) => Number(y) - Number(x))[0];

  let d = await get(`/api/documents/${ownDocId}`, { cookie: nanny });
  ok(d.status === 200 && d.res.headers.get('content-type') === 'application/pdf' && d.res.headers.get('x-content-type-options') === 'nosniff', 'владелец скачивает файл, заголовки безопасности стоят');
  ok((d.res.headers.get('content-security-policy') ?? '').includes('sandbox'), 'файл отдаётся с CSP sandbox');
  d = await get(`/api/documents/${ownDocId}`);
  ok(d.status === 401, 'гость не может скачать документ (401)');
  d = await get(`/api/documents/${ownDocId}`, { cookie: parent });
  ok(d.status === 404, 'обычный пользователь не видит чужой документ (404)');
  d = await get(`/api/documents/${ownDocId}`, { cookie: manager });
  ok(d.status === 200, 'менеджер открывает документ специалиста');
  d = await get(`/api/documents/${ownDocId}`, { cookie: admin });
  ok(d.status === 200, 'админ открывает документ специалиста');
  d = await get('/api/documents/abc', { cookie: admin });
  ok(d.status === 404, 'неверный id документа -> 404');

  r = await get('/dashboard', { cookie: manager });
  const acceptForm = forms(r.text).find((f) => f.fields.docId === newDocId && f.fields.status === 'accepted')!;
  ok(!!acceptForm, 'менеджер видит новый документ в очереди с кнопкой «Принять»');
  a = await post('/dashboard', acceptForm, {}, { cookie: nanny });
  ok(a.location.includes('msg=forbidden'), 'специалист не может принять свой документ');
  a = await post('/dashboard', acceptForm, {}, { cookie: manager });
  ok(a.location.includes('msg=updated'), 'менеджер принял документ');
  r = await get('/provider/1');
  ok(/Подтверждённых документов: \d+/.test(r.text), 'на странице специалиста видно число подтверждённых документов, но не файлы');
  ok(!r.text.includes('/api/documents/'), 'публичная страница не содержит ссылок на файлы');

  console.log('Поиск, сортировка, календарь');
  r = await get('/?q=Бассейн');
  ok(r.text.includes('Дельфинёнок') && !r.text.includes('Робототехника «Кубик»'), 'поиск по тексту находит нужное и скрывает остальное');
  r = await get('/?q=%25');
  ok(r.status === 200 && r.text.includes('class="empty"'), 'символ % в поиске не показывает всё подряд');
  r = await get('/?q=nothing-like-this');
  ok(r.text.includes('class="empty"') && r.text.includes('nothing-like-this'), 'пустой результат поиска с понятным сообщением');
  r = await get('/?sort=price_asc');
  ok(r.text.indexOf('Мадина Е.') < r.text.indexOf('Дельфинёнок'), 'сортировка «Дешевле»');
  r = await get('/?sort=price_desc');
  ok(r.text.indexOf('Дельфинёнок') < r.text.indexOf('Мадина Е.'), 'сортировка «Дороже»');
  r = await get('/?sort=%27%3Bdrop');
  ok(r.status === 200, 'неверная сортировка не ломает страницу');
  r = await get('/?q=английский&sort=rating', { lang: 'en' });
  ok(r.text.includes('name="q"') && r.text.includes('Sort by'), 'форма поиска и сортировка переведены');
  r = await get('/provider/1');
  ok(r.text.includes('class="cal"') && r.text.includes('Выберите дату') && /class="cal-d has/.test(r.text), 'на странице специалиста есть календарь со свободными датами');
  r = await get('/provider/1?date=2020-01-01');
  ok(r.status === 200 && r.text.includes('class="cal"'), 'дата вне календаря не ломает страницу');
  r = await get('/provider/1?date=zzz');
  ok(r.status === 200, 'мусор вместо даты не ломает страницу');

  console.log('Чат');
  r = await get('/dashboard', { cookie: parent });
  const chatId = /\/chat\/(\d+)/.exec(r.text)?.[1];
  ok(!!chatId, 'в кабинете у записи есть кнопка «Чат»');
  r = await get(`/chat/${chatId}`);
  ok(r.status === 307 && r.location.includes('/login'), 'гость не открывает чат');
  r = await get(`/chat/${chatId}`, { cookie: parent2 });
  ok(r.status === 404, 'чужой чат не открывается (404)');
  r = await get(`/chat/${chatId}`, { cookie: manager });
  ok(r.status === 404, 'менеджер не видит чат без жалобы');
  r = await get(`/chat/${chatId}`, { cookie: parent });
  ok(r.status === 200 && r.text.includes('Подскажите, пожалуйста'), 'участник читает переписку');
  const chatForm = forms(r.text).find((f) => 'bookingId' in f.fields && f.html.includes('name="body"'))!;
  a = await post(`/chat/${chatId}`, chatForm, { body: 'Тестовое сообщение <b>жирный</b>' }, { cookie: parent2 });
  ok(a.location.includes('msg=not_found'), 'посторонний не может писать в чужой чат');
  a = await post(`/chat/${chatId}`, chatForm, { body: 'Тестовое сообщение <b>жирный</b>' }, { cookie: parent });
  ok(a.location.includes('msg=sent'), 'сообщение отправлено');
  r = await get(`/chat/${chatId}`, { cookie: nanny });
  ok(r.text.includes('Тестовое сообщение &lt;b&gt;жирный&lt;/b&gt;') && !r.text.includes('<b>жирный</b>'), 'собеседник видит сообщение, HTML экранируется');
  a = await post(`/chat/${chatId}`, chatForm, { body: '   ' }, { cookie: parent });
  ok(a.location.includes('msg=invalid'), 'пустое сообщение отклоняется');

  console.log('Жалобы и блокировка');
  r = await get('/provider/3');
  ok(!r.text.includes('name="targetType"'), 'гость не видит форму жалобы');
  r = await get('/provider/3', { cookie: parent });
  const repForm = forms(r.text).find((f) => f.fields.targetType === 'provider')!;
  ok(!!repForm, 'вошедший пользователь видит форму жалобы');
  a = await post('/provider/3', repForm, { reason: 'spam', details: 'проверка' }, { cookie: parent });
  ok(a.location.includes('msg=reported'), 'жалоба отправлена');
  a = await post('/provider/3', repForm, { reason: 'spam' }, { cookie: parent });
  ok(a.location.includes('msg=already_reported'), 'повторная открытая жалоба отклоняется');
  a = await post('/provider/3', repForm, { reason: 'bad-reason' }, { cookie: parent2 });
  ok(a.location.includes('msg=invalid'), 'неверная причина жалобы отклоняется');
  r = await get('/dashboard', { cookie: manager });
  ok(r.text.includes('Жалобы на рассмотрении') && r.text.includes('проверка'), 'менеджер видит жалобу');
  r = await get('/dashboard?tab=reports', { cookie: admin });
  ok(r.text.includes('Жалобы на рассмотрении') && r.text.includes('Заблокировать аккаунт'), 'админ видит жалобы и кнопку блокировки');
  r = await get('/dashboard', { cookie: manager });
  ok(!r.text.includes('Заблокировать аккаунт'), 'менеджеру кнопка блокировки не показывается');
  const dismissForm = forms(r.text).find((f) => f.fields.action === 'dismiss' && 'reportId' in f.fields)!;
  a = await post('/dashboard', dismissForm, {}, { cookie: parent });
  ok(a.location.includes('msg=forbidden'), 'обычный пользователь не обрабатывает жалобы');
  const blockAsManager = { html: '', fields: { ...dismissForm.fields, action: 'block_user' } };
  a = await post('/dashboard', blockAsManager, { note: 'причина' }, { cookie: manager });
  ok(a.location.includes('msg=forbidden'), 'менеджер не может заблокировать аккаунт даже подделав форму');
  a = await post('/dashboard', dismissForm, {}, { cookie: manager });
  ok(a.location.includes('msg=updated'), 'менеджер закрыл жалобу');

  r = await get('/dashboard?tab=users', { cookie: admin });
  const blockForm = forms(r.text).find((f) => f.fields.userId === String(ids.parent2) && f.fields.active === '0')!;
  ok(!!blockForm, 'админ видит форму блокировки');
  a = await post('/dashboard', blockForm, { reason: '' }, { cookie: admin });
  ok(a.location.includes('msg=reason_required'), 'блокировка без причины отклоняется');
  a = await post('/dashboard', blockForm, { reason: 'нарушение правил' }, { cookie: manager });
  ok(a.location.includes('msg=forbidden'), 'менеджер не блокирует аккаунты');
  a = await post('/dashboard', blockForm, { reason: 'нарушение правил' }, { cookie: admin });
  ok(a.location.includes('msg=updated'), 'админ заблокировал аккаунт');
  r = await get('/dashboard', { cookie: parent2 });
  ok(r.status === 307 && r.location.includes('/login'), 'заблокированный сразу теряет доступ');
  r = await get('/dashboard?tab=users', { cookie: admin });
  ok(r.text.includes('нарушение правил'), 'причина блокировки видна админу');

  console.log('Уведомления');
  r = await get('/notifications');
  ok(r.status === 307 && r.location.includes('/login'), 'гость не открывает уведомления');
  r = await get('/notifications', { cookie: nanny });
  ok(r.status === 200 && r.text.includes('Новая заявка'), 'специалист видит уведомление о заявке');
  ok(/class="bell"[^>]*aria-label="Уведомления, новых: \d+"/.test(r.text) && r.text.includes('class="bell-n"'), 'в шапке колокольчик со счётчиком');
  r = await get('/notifications', { cookie: nanny, lang: 'en' });
  ok(r.text.includes('New booking request'), 'уведомления переводятся');
  const readForm = forms(r.text).find((f) => f.html.includes('Mark all as read'))!;
  a = await post('/notifications', readForm, {}, { cookie: nanny });
  ok(a.location.includes('/notifications'), 'кнопка «отметить прочитанными» работает');
  r = await get('/notifications', { cookie: nanny });
  ok(!r.text.includes('class="bell-n"'), 'после прочтения счётчик в шапке пропал');

  console.log(`\nИтого: ${passed} успешно, ${failed} с ошибкой`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
