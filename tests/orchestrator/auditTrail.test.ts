import { AuditTrail, MAX_AUDIT_MESSAGE_LENGTH } from '../../src/orchestrator/auditTrail';

describe('AuditTrail', () => {
  it('starts empty', () => {
    expect(new AuditTrail().entries).toEqual([]);
  });

  it('keeps entries in the order they were added', () => {
    const trail = new AuditTrail();
    trail.add('sentinel', true, 'checks passed');
    trail.add('policy', false, 'per-task cap');

    expect(trail.entries).toEqual([
      { layer: 'sentinel', passed: true, message: 'checks passed' },
      { layer: 'policy', passed: false, message: 'per-task cap' },
    ]);
  });

  it('adds one entry per message with addAll', () => {
    const trail = new AuditTrail();
    trail.addAll('sentinel', false, ['too far', 'photo too old']);

    expect(trail.entries).toEqual([
      { layer: 'sentinel', passed: false, message: 'too far' },
      { layer: 'sentinel', passed: false, message: 'photo too old' },
    ]);
  });

  it('adds nothing for an empty addAll', () => {
    const trail = new AuditTrail();
    trail.addAll('policy', false, []);
    expect(trail.entries).toEqual([]);
  });

  it('cuts a very long message down to the limit', () => {
    const trail = new AuditTrail();
    trail.add('agent', true, 'x'.repeat(5000));

    const [entry] = trail.entries;
    expect(entry.message).toHaveLength(MAX_AUDIT_MESSAGE_LENGTH);
    expect(entry.message.endsWith('...')).toBe(true);
  });

  it('leaves a message at exactly the limit alone', () => {
    const trail = new AuditTrail();
    const exact = 'y'.repeat(MAX_AUDIT_MESSAGE_LENGTH);
    trail.add('agent', true, exact);

    expect(trail.entries[0].message).toBe(exact);
  });

  it('does not let callers change the trail through the returned list', () => {
    const trail = new AuditTrail();
    trail.add('claim', true, 'pending');
    trail.entries.push({ layer: 'xrpl', passed: true, message: 'sneaky' });

    expect(trail.entries).toHaveLength(1);
  });
});
