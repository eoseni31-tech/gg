import { verifyPassword, hashPassword } from './password.mjs';
const stamp = () => new Date().toISOString(), uid = () => crypto.randomUUID(), random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
export async function digest(v) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))), x => x.toString(16).padStart(2, '0')).join(''); }
export function problem(status, message) { throw Object.assign(new Error(message), { status }); }
function txt(v, max = 200, required = false) { if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    problem(400, 'Please check the submitted details.'); return v.trim(); }
function count(v) { if (!Number.isInteger(v) || Number(v) < 1 || Number(v) > 20)
    problem(400, 'Party size must be between 1 and 20.'); return Number(v); }
function key(v) { const s = txt(v, 100, true); if (!/^[a-zA-Z0-9_-]{16,100}$/.test(s))
    problem(400, 'Invalid submission key.'); return s; }
function amount(v) { const s = txt(v, 14, true); if (!/^\d{1,10}(\.\d{1,2})?$/.test(s))
    problem(400, 'Use a positive amount with at most two decimal places.'); const [a, b = ''] = s.split('.'); const n = Number(a) * 100 + Number(b.padEnd(2, '0')); if (!Number.isSafeInteger(n) || n < 1 || n > 1e12)
    problem(400, 'Invalid gift amount.'); return n; }
const currencies = ['NGN', 'USD', 'GBP', 'EUR'], methods = ['cash', 'bank_transfer'];
export async function handle(req, db, platformUser, config = {}) {
    let user = null;
    let session = null;
    const p = (sql, ...values) => db.prepare(sql).bind(...values), one = async (sql, ...v) => await p(sql, ...v).first(), all = async (sql, ...v) => (await p(sql, ...v).all()).results, run = async (sql, ...v) => await p(sql, ...v).run();
    const log = (w, actor, action, before, after) => p('INSERT INTO audit VALUES(?,?,?,?,?,?,?)', uid(), w, actor, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, stamp());
    const reply = (v, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
    async function rate(k, max = 60) { const bucket = Math.floor(Date.now() / 900000), q = k + ':' + bucket; await run('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', q, Date.now() + 900000); const r = await one('SELECT count FROM rate_limits WHERE key=?', q); if (r.count > max)
        problem(429, 'Too many requests. Please try again later.'); if (Math.random() < .01)
        await run('DELETE FROM rate_limits WHERE expires<?', Date.now()); }
    async function owner(w) { if (!user)
        problem(401, 'Please sign in with your couple code.'); const row = user.userId === 'platform-admin' ? await one('SELECT * FROM weddings WHERE id=?', w) : await one('SELECT * FROM weddings WHERE id=? AND couple_id=?', w, user.userId); if (!row)
        problem(404, 'Wedding not found.'); return row; }
    async function responses(w) { const rs = await all('SELECT id,invitee_id,guest_name,attending,party,notes,created_at,updated_at FROM rsvps WHERE wedding_id=? ORDER BY updated_at DESC', w); const ev = await all('SELECT re.rsvp_id,e.id,e.name FROM rsvp_events re JOIN events e ON re.event_id=e.id JOIN rsvps r ON re.rsvp_id=r.id WHERE r.wedding_id=?', w); return rs.map((r) => ({ ...r, events: ev.filter((e) => e.rsvp_id === r.id).map(({ id, name }) => ({ id, name })) })); }
    try {
        const sessionToken = (req.headers.get('cookie') || '').match(/(?:^|;\s*)sg_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (sessionToken) {
            session = await one('SELECT s.*,c.email FROM sessions s JOIN couples c ON c.id=s.couple_id WHERE s.token_hash=? AND s.expires>?', await digest(sessionToken), Date.now());
            if (session)
                user = { userId: session.couple_id, email: session.email };
        }
        const url = new URL(req.url), path = url.pathname, method = req.method;
        let body = {};
        const write = ['POST', 'PATCH', 'DELETE'].includes(method);
        if (write) {
            const o = req.headers.get('origin');
            const allowedGuest = path.startsWith('/api/public/') && !!o && !!config.publicOrigins?.includes(o);
            if (o && o !== (config.origin || url.origin) && !allowedGuest)
                problem(403, 'Request origin denied.');
            if (req.headers.get('sec-fetch-site') === 'cross-site' && !allowedGuest)
                problem(403, 'Request origin denied.');
            if (req.headers.get('content-type')?.split(';')[0] !== 'application/json')
                problem(415, 'JSON required.');
            const raw = await req.text();
            if (new TextEncoder().encode(raw).length > 16384)
                problem(413, 'Submission is too large.');
            try {
                body = JSON.parse(raw);
            }
            catch {
                problem(400, 'Invalid request.');
            }
            if (!body || typeof body !== 'object' || Array.isArray(body))
                problem(400, 'Invalid request.');
            const ip = config.clientIp || req.headers.get('cf-connecting-ip') || 'unknown';
            await rate('write:' + ip, 120);
            if (!path.startsWith('/api/public/') && !['/api/bootstrap', '/api/code-login', '/api/recovery'].includes(path) && req.headers.get('x-csrf-token') !== (session?.csrf))
                problem(403, 'Please reload and try again.');
        }
        if (path === '/api/recovery' && method === 'POST') {
            await rate('recovery:' + (config.clientIp || req.headers.get('cf-connecting-ip') || 'unknown'), 3);
            const contact = txt(body.contact, 254, true), slug = txt(body.wedding_slug, 100, true);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
                problem(400, 'Enter a valid contact email.');
            const w = await one('SELECT id FROM weddings WHERE slug=?', slug);
            if (w)
                await run('INSERT INTO recovery_requests VALUES(?,?,?,?,?)', uid(), w.id, contact.toLowerCase(), 'pending', stamp());
            return reply({ ok: true, message: 'If the wedding can be identified, Safiyah’s Gleam will review your request and verify your identity before assigning a replacement code.' });
        }
        if (path === '/api/code-login' && method === 'POST') {
            await rate('login:' + (config.clientIp || req.headers.get('cf-connecting-ip') || 'unknown'), 10);
            if (!config.codePepper)
                problem(503, 'Code sign-in is not configured.');
            const code = txt(body.code, 128, true);
            const password = body.password;
            if (typeof password !== 'string' || password.length > 128 || password.length < 12)
                problem(401, 'The access code or password is incorrect.');
            const c = await one('SELECT c.id,c.email FROM access_codes a JOIN couples c ON c.id=a.couple_id WHERE a.code_hash=?', await digest(config.codePepper + ':' + code));
            const credential = c ? await one('SELECT salt,password_hash FROM password_credentials WHERE couple_id=?', c.id) : null;
            if (!credential || !await verifyPassword(password, credential))
                problem(401, 'The access code or password is incorrect.');
            const t = random(), csrf = random(), tokenHash = await digest(t);
            await run('INSERT INTO sessions VALUES(?,?,?,?)', tokenHash, c.id, csrf, Date.now() + 12 * 3600000);
            const response = reply({ ok: true, csrf, next: c.id === 'platform-admin' ? '/admin' : '/dashboard' });
            response.headers.set('Set-Cookie', `sg_session=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`);
            return response;
        }
        if (path === '/api/logout' && method === 'POST') {
            if (!session)
                problem(401, 'Please sign in with your couple code.');
            await run('DELETE FROM sessions WHERE token_hash=?', session.token_hash);
            const response = reply({ ok: true });
            response.headers.set('Set-Cookie', 'sg_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            return response;
        }
        if (path === '/api/me' && method === 'GET') {
            if (!user)
                problem(401, 'Please sign in with your couple code.');
            return reply({ email: user.email, csrf: session.csrf, is_admin: user.userId === 'platform-admin', weddings: user.userId === 'platform-admin' ? await all('SELECT id,slug,title,max_party FROM weddings ORDER BY created_at') : await all('SELECT id,slug,title,max_party FROM weddings WHERE couple_id=? ORDER BY created_at', user.userId) });
        }
        if (path.startsWith('/api/admin/')) {
            if (user?.userId !== 'platform-admin')
                problem(403, 'Only the platform owner can assign access codes.');
            if (path === '/api/admin/recovery' && method === 'GET')
                return reply(await all('SELECT r.id,r.contact,r.status,r.created_at,w.title,w.slug FROM recovery_requests r JOIN weddings w ON w.id=r.wedding_id ORDER BY r.created_at DESC'));
            if (path === '/api/admin/recovery' && method === 'POST') {
                const record = await one('SELECT * FROM recovery_requests WHERE id=?', txt(body.id, 64, true));
                if (!record)
                    problem(404, 'Request not found.');
                await db.batch([p("UPDATE recovery_requests SET status='closed' WHERE id=?", record.id), log(record.wedding_id, user.userId, 'recovery.closed', { status: record.status }, { status: 'closed' })]);
                return reply({ ok: true });
            }
            if (path === '/api/admin/owner-code' && method === 'POST') {
                if (!config.codePepper)
                    problem(503, 'Code sign-in is not configured.');
                const code = txt(body.code, 128, true);
                if (code.length < 16)
                    problem(400, 'Use at least 16 characters.');
                const hashed = await digest(config.codePepper + ':' + code), other = await one('SELECT couple_id FROM access_codes WHERE code_hash=?', hashed);
                if (other && other.couple_id !== 'platform-admin')
                    problem(409, 'That code is already assigned.');
                await db.batch([p('DELETE FROM access_codes WHERE couple_id=?', 'platform-admin'), p('INSERT INTO access_codes VALUES(?,?,?)', hashed, 'platform-admin', stamp()), p('DELETE FROM sessions WHERE couple_id=?', 'platform-admin')]);
                const response = reply({ ok: true });
                response.headers.set('Set-Cookie', 'sg_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
                return response;
            }
            if (path === '/api/admin/weddings' && method === 'GET')
                return reply(await all('SELECT id,slug,title,couple_id,max_party FROM weddings ORDER BY created_at'));
            if (path === '/api/admin/weddings' && method === 'POST') {
                const title = txt(body.title, 150, true), slug = body.slug ? txt(body.slug, 100, true) : 'celebration-' + random().slice(0, 16);
                if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
                    problem(400, 'Use letters, numbers and single hyphens for the invitation address.');
                if (await one('SELECT id FROM weddings WHERE slug=?', slug))
                    problem(409, 'That invitation address is already used.');
                const c = uid(), w = uid();
                await db.batch([p('INSERT INTO couples VALUES(?,?,?)', c, txt(body.email || '', 254), stamp()), p('INSERT INTO weddings VALUES(?,?,?,?,?,?,?)', w, c, slug, title, count(body.max_party || 1), 'active', stamp()), p('INSERT INTO events VALUES(?,?,?,?)', uid(), w, 'Traditional wedding', null), p('INSERT INTO events VALUES(?,?,?,?)', uid(), w, 'White wedding', null), log(w, user.userId, 'wedding.created', null, { id: w, title })]);
                return reply({ id: w, slug, title }, 201);
            }
            if (path === '/api/admin/code' && method === 'POST') {
                if (!config.codePepper)
                    problem(503, 'Code sign-in is not configured.');
                const w = await one('SELECT * FROM weddings WHERE id=?', txt(body.wedding_id, 64, true));
                if (!w)
                    problem(404, 'Wedding not found.');
                const code = txt(body.code, 128, true);
                if (code.length < 16)
                    problem(400, 'Use a code with at least 16 characters; the generator is recommended.');
                const credential = await hashPassword(body.password);
                const hashed = await digest(config.codePepper + ':' + code), other = await one('SELECT couple_id FROM access_codes WHERE code_hash=?', hashed);
                if (other && other.couple_id !== w.couple_id)
                    problem(409, 'That code is already assigned. Generate a different code.');
                await db.batch([p('DELETE FROM access_codes WHERE couple_id=?', w.couple_id), p('INSERT INTO access_codes VALUES(?,?,?)', hashed, w.couple_id, stamp()), p('DELETE FROM sessions WHERE couple_id=?', w.couple_id), p('INSERT INTO password_credentials VALUES(?,?,?) ON CONFLICT(couple_id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash', w.couple_id, credential.salt, credential.password_hash), log(w.id, user.userId, 'access_code.rotated', null, { couple_id: w.couple_id })]);
                return reply({ ok: true });
            }
            problem(404, 'Not found.');
        }
        const pub = path.match(/^\/api\/public\/([a-z0-9-]+)(?:\/(rsvp|gifts))?$/);
        if (pub) {
            const w = await one('SELECT id,slug,title,max_party FROM weddings WHERE slug=? AND status=?', pub[1], 'active');
            if (!w)
                problem(404, 'This invitation is not connected yet. Please contact Safiyah’s Gleam.');
            if (method === 'GET' && !pub[2])
                return reply({ ...w, events: await all('SELECT id,name,date FROM events WHERE wedding_id=?', w.id), payments_enabled: false, payment_details: w.slug === 'osato-osakpolor' ? { provider: 'Opay', account_number: '9158718272', currency: 'NGN', verification_required: true } : null });
            if (method !== 'POST')
                problem(405, 'Method not allowed.');
            await rate('public:' + (config.clientIp || req.headers.get('cf-connecting-ip') || 'unknown'), 40);
            const request = key(body.request_key);
            if (pub[2] === 'rsvp') {
                const name = txt(body.guest_name, 120, true), notes = txt(body.notes || '', 1000);
                if (typeof body.attending !== 'boolean')
                    problem(400, 'Select your attendance response.');
                const attending = body.attending ? 1 : 0;
                const invitation = body.invitation ? await one('SELECT * FROM invitees WHERE token_hash=? AND wedding_id=?', await digest(txt(body.invitation, 64, true)), w.id) : null;
                if (body.invitation && !invitation)
                    problem(400, 'Invalid invitation.');
                const party = attending ? count(body.party) : 0;
                if (party > (invitation?.max_party || w.max_party))
                    problem(400, 'Your party exceeds the invitation limit.');
                const selected = Array.isArray(body.events) ? [...new Set(body.events)] : [];
                const eventRows = await all('SELECT id FROM events WHERE wedding_id=?', w.id);
                if (selected.length > 20 || selected.some(e => !eventRows.some((r) => r.id === e)))
                    problem(400, 'Please choose valid celebrations.');
                if (attending && !selected.length)
                    problem(400, 'Select at least one celebration.');
                const old = invitation ? await one('SELECT * FROM rsvps WHERE invitee_id=?', invitation.id) : body.edit_token ? await one('SELECT * FROM rsvps WHERE wedding_id=? AND edit_hash=?', w.id, await digest(txt(body.edit_token, 64, true))) : await one('SELECT * FROM rsvps WHERE wedding_id=? AND request_key=?', w.id, request);
                if (body.edit_token && !old)
                    problem(400, 'The response edit code is invalid.');
                if (old && old.request_key === request)
                    return reply({ ok: true, id: old.id, duplicate: true });
                if (old && (!body.edit_token || await digest(txt(body.edit_token, 64, true)) !== old.edit_hash))
                    problem(409, 'A response exists. Use its original private edit code.');
                const rid = old?.id || uid(), edit = old ? body.edit_token : random();
                const statements = [old ? p('UPDATE rsvps SET guest_name=?,attending=?,party=?,notes=?,request_key=?,updated_at=? WHERE id=? AND wedding_id=?', name, attending, party, notes, request, stamp(), rid, w.id) : p('INSERT INTO rsvps VALUES(?,?,?,?,?,?,?,?,?,?,?)', rid, w.id, invitation?.id || null, name, attending, party, notes, request, await digest(edit), stamp(), stamp()), p('DELETE FROM rsvp_events WHERE rsvp_id=?', rid), ...(attending ? selected.map(e => p('INSERT INTO rsvp_events VALUES(?,?)', rid, e)) : []), log(w.id, null, old ? 'rsvp.updated' : 'rsvp.created', old, { id: rid, guest_name: name, attending, party, events: selected })];
                try {
                    await db.batch(statements);
                }
                catch (e) {
                    const duplicate = await one('SELECT id FROM rsvps WHERE wedding_id=? AND request_key=?', w.id, request);
                    if (duplicate)
                        return reply({ ok: true, id: duplicate.id, duplicate: true });
                    throw e;
                }
                return reply({ ok: true, id: rid, edit_token: edit }, 201);
            }
            if (pub[2] === 'gifts') {
                const old = await one('SELECT id FROM gifts WHERE wedding_id=? AND request_key=?', w.id, request);
                if (old)
                    return reply({ ok: true, id: old.id, duplicate: true });
                const n = amount(body.amount), currency = txt(body.currency, 3, true), method = txt(body.method, 20, true);
                if (!currencies.includes(currency) || !methods.includes(method))
                    problem(400, 'Choose a valid currency and gift method.');
                const gid = uid(), name = txt(body.guest_name || '', 120), notes = txt(body.notes || '', 1000), reference = txt(body.reference || '', 100);
                if (method === 'bank_transfer' && w.slug === 'osato-osakpolor' && currency !== 'NGN')
                    problem(400, 'Transfers to the Opay account must be reported in NGN.');
                try {
                    await db.batch([p('INSERT INTO gifts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', gid, w.id, name, n, currency, method, 'guest_report', 'reported', notes, reference || null, request, stamp(), stamp()), log(w.id, null, 'gift.reported', null, { id: gid, amount_minor: n, currency })]);
                }
                catch (e) {
                    const duplicate = await one('SELECT id FROM gifts WHERE wedding_id=? AND request_key=?', w.id, request);
                    if (duplicate)
                        return reply({ ok: true, id: duplicate.id, duplicate: true });
                    throw e;
                }
                return reply({ ok: true, id: gid, status: 'reported' }, 201);
            }
            problem(404, 'Not found.');
        }
        const priv = path.match(/^\/api\/weddings\/([a-f0-9-]+)\/(summary|rsvps|gifts|audit|settings|export|invitees)(?:\/([a-f0-9-]+))?$/);
        if (priv) {
            const w = priv[1], type = priv[2], record = priv[3], wedding = await owner(w);
            if (method === 'GET') {
                if (type === 'summary') {
                    const counts = await one('SELECT COUNT(*) responses,COALESCE(SUM(attending),0) accepted,COALESCE(SUM(CASE WHEN attending=1 THEN party ELSE 0 END),0) attendees,COALESCE(SUM(CASE WHEN attending=0 THEN 1 ELSE 0 END),0) declined FROM rsvps WHERE wedding_id=?', w), list = await one('SELECT COUNT(*) n FROM invitees WHERE wedding_id=?', w);
                    return reply({ ...counts, not_responded: list.n ? (await one('SELECT COUNT(*) n FROM invitees i WHERE i.wedding_id=? AND NOT EXISTS(SELECT 1 FROM rsvps r WHERE r.invitee_id=i.id)', w)).n : null, gifts: await all("SELECT currency,COALESCE(SUM(CASE WHEN status='received' THEN amount_minor ELSE 0 END),0) confirmed_minor,SUM(CASE WHEN status='received' THEN 1 ELSE 0 END) confirmed_count,COALESCE(SUM(CASE WHEN status='reported' THEN amount_minor ELSE 0 END),0) reported_minor,SUM(CASE WHEN status='reported' THEN 1 ELSE 0 END) pending_count FROM gifts WHERE wedding_id=? GROUP BY currency", w) });
                }
                if (type === 'rsvps')
                    return reply(await responses(w));
                if (type === 'gifts')
                    return reply(await all('SELECT * FROM gifts WHERE wedding_id=? ORDER BY updated_at DESC', w));
                if (type === 'audit')
                    return reply(await all('SELECT * FROM audit WHERE wedding_id=? ORDER BY created_at DESC LIMIT 200', w));
                if (type === 'invitees')
                    return reply(await all('SELECT i.id,i.name,i.max_party,CASE WHEN r.id IS NULL THEN 0 ELSE 1 END responded FROM invitees i LEFT JOIN rsvps r ON r.invitee_id=i.id WHERE i.wedding_id=? ORDER BY i.name', w));
                if (type === 'settings')
                    return reply({ wedding, events: await all('SELECT * FROM events WHERE wedding_id=?', w) });
                if (type === 'export') {
                    const escape = (x) => '"' + String(x ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
                    const rs = await responses(w);
                    const rows = [['Name', 'Response', 'Party', 'Events', 'Notes', 'Submitted'], ...rs.map((r) => [r.guest_name, r.attending ? 'Attending' : 'Declined', r.party, r.events.map((e) => e.name).join('; '), r.notes, r.created_at])];
                    return new Response('\uFEFF' + rows.map(r => r.map(escape).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="rsvps.csv"', 'Cache-Control': 'no-store' } });
                }
            }
            if (record && method === 'DELETE' && ['rsvps', 'gifts'].includes(type)) {
                const table = type === 'rsvps' ? 'rsvps' : 'gifts';
                const before = await one(`SELECT * FROM ${table} WHERE id=? AND wedding_id=?`, record, w);
                if (!before)
                    problem(404, 'Record not found.');
                await db.batch([p(`DELETE FROM ${table} WHERE id=? AND wedding_id=?`, record, w), log(w, user.userId, table === 'rsvps' ? 'rsvp.deleted' : 'gift.deleted', before, null)]);
                return reply({ ok: true });
            }
            if (type === 'gifts' && method === 'POST') {
                const request = key(body.request_key), old = await one('SELECT id FROM gifts WHERE wedding_id=? AND request_key=?', w, request);
                if (old)
                    return reply({ ok: true, id: old.id, duplicate: true });
                const n = amount(body.amount), currency = txt(body.currency, 3, true), method = txt(body.method, 20, true);
                if (!currencies.includes(currency) || !methods.includes(method))
                    problem(400, 'Choose a valid currency and gift method.');
                const gid = uid(), name = txt(body.guest_name || '', 120), notes = txt(body.notes || '', 1000);
                await db.batch([p('INSERT INTO gifts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', gid, w, name, n, currency, method, 'couple_manual', 'reported', notes, null, request, stamp(), stamp()), log(w, user.userId, 'gift.created', null, { id: gid, guest_name: name, amount_minor: n, currency })]);
                return reply({ ok: true, id: gid }, 201);
            }
            if (type === 'gifts' && record && method === 'PATCH') {
                const before = await one('SELECT * FROM gifts WHERE id=? AND wedding_id=?', record, w);
                if (!before)
                    problem(404, 'Gift not found.');
                const status = body.status || before.status;
                if (!['reported', 'received', 'void'].includes(status))
                    problem(400, 'Invalid status.');
                const after = { ...before, status, notes: body.notes === undefined ? before.notes : txt(body.notes, 1000), guest_name: body.guest_name === undefined ? before.guest_name : txt(body.guest_name, 120), amount_minor: body.amount === undefined ? before.amount_minor : amount(body.amount), updated_at: stamp() };
                if (before.status === 'received' && after.amount_minor !== before.amount_minor)
                    problem(400, 'Reopen the gift as reported before correcting the amount.');
                const version = body.expected_updated_at;
                if (version && version !== before.updated_at)
                    problem(409, 'This gift changed. Reload it before saving.');
                const result = await db.batch([p('UPDATE gifts SET status=?,notes=?,guest_name=?,amount_minor=?,updated_at=? WHERE id=? AND wedding_id=? AND updated_at=?', after.status, after.notes, after.guest_name, after.amount_minor, after.updated_at, record, w, before.updated_at), p('INSERT INTO audit SELECT ?,?,?,?,?,?,? WHERE changes()=1', uid(), w, user.userId, 'gift.updated', JSON.stringify(before), JSON.stringify(after), stamp())]);
                if (!result[0].meta?.changes)
                    problem(409, 'This gift changed. Reload it before saving.');
                return reply({ ok: true });
            }
            if (type === 'settings' && method === 'PATCH') {
                const title = txt(body.title, 150, true), max = count(body.max_party);
                if (!Array.isArray(body.events) || body.events.length > 20)
                    problem(400, 'Invalid events.');
                for (const e of body.events) {
                    txt(e.name, 120, true);
                    if (!await one('SELECT id FROM events WHERE id=? AND wedding_id=?', e.id, w))
                        problem(400, 'Invalid event.');
                    if (e.date && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.date))
                        problem(400, 'Invalid event date.');
                }
                await db.batch([p('UPDATE weddings SET title=?,max_party=? WHERE id=?', title, max, w), ...body.events.map((e) => p('UPDATE events SET name=?,date=? WHERE id=? AND wedding_id=?', e.name, e.date || null, e.id, w)), log(w, user.userId, 'settings.updated', wedding, body)]);
                return reply({ ok: true });
            }
            if (type === 'invitees' && method === 'POST') {
                const name = txt(body.name, 120, true), max = count(body.max_party || 1), inv = uid(), t = random();
                await db.batch([p('INSERT INTO invitees VALUES(?,?,?,?,?)', inv, w, name, await digest(t), max), log(w, user.userId, 'invitation.created', null, { id: inv, name, max_party: max })]);
                return reply({ id: inv, url: '/w/' + wedding.slug + '?invitation=' + t }, 201);
            }
            problem(405, 'Method not allowed.');
        }
        problem(404, 'Not found.');
    }
    catch (e) {
        if (!e.status)
            console.error('Wedding request failed', e.message);
        return reply({ error: e.status ? e.message : 'Something went wrong. Please try again.' }, e.status || 500);
    }
}
