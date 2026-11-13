'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { loginAction, registerAction, type AuthState } from '@/app/actions';

type Labels = Record<string, string>;

function ErrorBox({ state, labels }: { state: AuthState; labels: Labels }) {
  if (!state?.error) return null;
  return (
    <div className="alert" role="alert">
      {labels[state.error] ?? labels['err.fields']}
      {state.error === 'err.disabled' && (
        <div style={{ marginTop: 6 }}>
          <Link href="/policy#s5">{labels['auth.disabledRules']}</Link>
          {' · '}
          <Link href="/support?topic=appeal">{labels['auth.disabledAppeal']}</Link>
        </div>
      )}
    </div>
  );
}

export function LoginForm({ labels, next }: { labels: Labels; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, null);
  return (
    <form action={action} noValidate>
      <ErrorBox state={state} labels={labels} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">{labels['auth.email']}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">{labels['auth.password']}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn big" type="submit" disabled={pending} style={{ width: '100%' }}>
        {labels['auth.submitLogin']}
      </button>
      <p className="alt">
        {labels['auth.noAccount']} <Link href="/register">{labels['nav.register']}</Link>
      </p>
    </form>
  );
}

export function RegisterForm({
  labels,
  workerKinds,
  defaultAcct,
  defaultKind,
}: {
  labels: Labels;
  workerKinds: string[];
  defaultAcct: 'user' | 'worker';
  defaultKind: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, null);
  const [acct, setAcct] = useState<'user' | 'worker'>(defaultAcct);
  const [kind, setKind] = useState(defaultKind);
  // на сервер уходит одна роль: parent для пользователя или тип специалиста
  const role = acct === 'user' ? 'parent' : kind;
  return (
    <form action={action} noValidate>
      <ErrorBox state={state} labels={labels} />
      <input type="hidden" name="role" value={role} />
      <div className="field">
        <span className="label" id="acct-label">{labels['auth.acct']}</span>
        <div className="acct" role="radiogroup" aria-labelledby="acct-label">
          {(['user', 'worker'] as const).map((a) => (
            <label className="radio" key={a}>
              <input type="radio" name="acct" value={a} checked={acct === a} onChange={() => setAcct(a)} />
              <span>
                {labels[`auth.acct.${a}`]}
                <small>{labels[`auth.acct.${a}.d`]}</small>
              </span>
            </label>
          ))}
        </div>
      </div>
      {acct === 'worker' && (
        <div className="field">
          <span className="label" id="kind-label">{labels['auth.workerKind']}</span>
          <div className="radios" role="radiogroup" aria-labelledby="kind-label">
            {workerKinds.map((k) => (
              <label className="radio" key={k}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span>{labels[`role.${k}`]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="name">{labels['auth.name']}</label>
        <input id="name" name="name" type="text" autoComplete="name" required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="email">{labels['auth.email']}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="phone">{labels['auth.phone']}</label>
        <input id="phone" name="phone" type="text" autoComplete="tel" maxLength={30} />
      </div>
      <div className="field">
        <label htmlFor="password">{labels['auth.password']}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <div className="hint">{labels['auth.passwordHint']}</div>
      </div>
      <div className="consent">
        <input id="consent" name="consent" type="checkbox" required aria-required="true" />
        <label htmlFor="consent">
          {labels['auth.consentPre']} <Link href="/policy" target="_blank">{labels['auth.consentRules']}</Link> {labels['auth.consentMid']}{' '}
          <Link href="/privacy" target="_blank">{labels['auth.consentPrivacy']}</Link>
        </label>
      </div>
      <button className="btn big" type="submit" disabled={pending} style={{ width: '100%' }}>
        {labels['auth.submitRegister']}
      </button>
      <p className="alt">
        {labels['auth.haveAccount']} <Link href="/login">{labels['nav.login']}</Link>
      </p>
    </form>
  );
}
