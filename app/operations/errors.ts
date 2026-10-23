export class OperationError extends Error {}
export class NotFoundError extends OperationError {}
export class InvalidOperationError extends OperationError {}
export class ConflictError extends OperationError {}
export class ForbiddenError extends OperationError {}
export class ConfirmationRequiredError extends OperationError {}
