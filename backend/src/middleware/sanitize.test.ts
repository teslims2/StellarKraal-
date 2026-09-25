/**
 * Security-focused tests for input sanitisation middleware.
 * Covers XSS, SQL injection, command injection, trimming, and length limits.
 */
import express from 'express';
import request from 'supertest';
import { MAX_FIELD_LENGTH, sanitizeInput } from './sanitize';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(sanitizeInput);
  app.post('/echo', (req, res) => {
    res.json({ body: req.body, query: req.query });
  });
  app.get('/echo', (req, res) => {
    res.json({ query: req.query });
  });
  app.get('/items/:id', (req, res) => {
    res.json({ id: req.params.id });
  });
  return app;
}

describe('sanitizeInput', () => {
  const app = makeApp();

  it('strips HTML tags from string fields', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ name: '<script>alert(1)</script>Ada', note: '<b>ok</b>' });

    expect(res.status).toBe(200);
    expect(res.body.body.name).toBe('alert(1)Ada');
    expect(res.body.body.note).toBe('ok');
  });

  it('trims whitespace from string fields', async () => {
    const res = await request(app).post('/echo').send({ name: '  Ada  ' });

    expect(res.status).toBe(200);
    expect(res.body.body.name).toBe('Ada');
  });

  it('escapes SQL-special characters in query params', async () => {
    const res = await request(app).get('/echo').query({ q: "1' OR '1'='1'; DROP TABLE loans;--" });

    expect(res.status).toBe(200);
    expect(res.body.query.q).toBe("1\\' OR \\'1\\'=\\'1\\'\\; DROP TABLE loans\\;\\-\\-");
    expect(res.body.query.q).not.toContain("';");
  });

  it('neutralises command-injection payloads in the body', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ cmd: 'hello`whoami` $(rm -rf /) ${HOME}' });

    expect(res.status).toBe(200);
    expect(res.body.body.cmd).not.toContain('`');
    expect(res.body.body.cmd).not.toContain('$(');
    expect(res.body.body.cmd).not.toContain('${');
    expect(res.body.body.cmd).toContain('hello');
  });

  it('rejects fields that exceed the maximum length with 422', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ name: 'a'.repeat(MAX_FIELD_LENGTH + 1) });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details[0].field).toBe('name');
  });

  it('sanitises route params', async () => {
    const res = await request(app).get('/items/' + encodeURIComponent('<b>42</b>'));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('42');
  });

  it('leaves requests without strings unchanged', async () => {
    const res = await request(app).post('/echo').send({ count: 2, ok: true });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ count: 2, ok: true });
  });

  it('strips nested HTML and trims nested strings', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ profile: { displayName: '  <i>Ada</i>  ' } });

    expect(res.status).toBe(200);
    expect(res.body.body.profile.displayName).toBe('Ada');
  });
});
