// Only the person who created (assigned) a card, or an admin, may edit it.
// Everyone else can still comment — that's enforced separately by each
// route's requireRole(['member', 'admin']) check.
export function canEditIssue(user, issue) {
  return user.role === 'admin' || issue.assignorId === user.id;
}
