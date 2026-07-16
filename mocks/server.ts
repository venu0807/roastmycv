import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      services: { database: 'ok', redis: 'ok', groq: 'ok', sentry: 'ok' },
      latencyMs: 10,
    })
  }),
  http.post('/api/roast', () => {
    return HttpResponse.json({
      roast: {
        score: 70,
        severity: 'medium',
        oneLiner: 'Test roast',
        strengths: ['Good formatting', 'Clear sections', 'Relevant skills'],
        roastPoints: [{ category: 'content', issue: 'Missing metrics', severity: 2, suggestion: 'Add numbers' }],
        actionPlan: [{ priority: 'high', area: 'Experience', task: 'Add metrics', details: 'Quantify impact', resources: [] }],
      },
    })
  })
)