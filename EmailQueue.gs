// ==========================================
// FILE: EmailQueue.gs
// ==========================================

var EMAIL_QUEUE_KEY = 'EMAIL_QUEUE';
var EMAIL_BATCH_SIZE = 5;

/**
 * Adds a regId to the async email queue and schedules processEmailQueue()
 * if a trigger is not already pending.
 *
 * Intended to be called from within processRegistration() while the script
 * lock is already held — does not acquire the lock itself.
 */
function queueConfirmationEmail(regId) {
  try {
    var props = PropertiesService.getScriptProperties();

    var queue = [];
    try {
      queue = JSON.parse(props.getProperty(EMAIL_QUEUE_KEY) || '[]');
    } catch (e) {
      queue = [];
    }
    queue.push(regId);
    props.setProperty(EMAIL_QUEUE_KEY, JSON.stringify(queue));

    // Create a one-off trigger only if none already exists for processEmailQueue
    var triggers = ScriptApp.getProjectTriggers();
    var hasTrigger = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processEmailQueue') {
        hasTrigger = true;
        break;
      }
    }
    if (!hasTrigger) {
      ScriptApp.newTrigger('processEmailQueue')
        .timeBased()
        .after(60000) // ~1 minute after registration completes
        .create();
    }
  } catch (e) {
    console.error('queueConfirmationEmail error: ' + e.toString());
    // Best-effort synchronous fallback so the email is not lost entirely
    try { sendConfirmationEmail(regId); } catch (e2) {
      console.error('queueConfirmationEmail sync fallback also failed: ' + e2.toString());
    }
  }
}

/**
 * Processes the pending email queue, sending up to EMAIL_BATCH_SIZE
 * confirmation emails per trigger run to stay within GAS execution limits.
 * Deletes its own triggers when the queue is fully drained.
 *
 * Invoked automatically by a time-based trigger created in queueConfirmationEmail().
 */
function processEmailQueue() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  var batch = [];

  // Step 1: Pop a batch from the queue while holding the lock
  try {
    lock.waitLock(30000);
    var queue = [];
    try {
      queue = JSON.parse(props.getProperty(EMAIL_QUEUE_KEY) || '[]');
    } catch (e) {
      queue = [];
    }
    batch = queue.splice(0, EMAIL_BATCH_SIZE);
    props.setProperty(EMAIL_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('processEmailQueue: could not acquire lock: ' + e.toString());
    return;
  } finally {
    lock.releaseLock();
  }

  if (batch.length === 0) {
    // Nothing to send — clean up any stale triggers and exit
    _deleteEmailQueueTriggers();
    return;
  }

  // Step 2: Send emails without holding the lock
  var failed = [];
  for (var i = 0; i < batch.length; i++) {
    var regId = batch[i];
    try {
      sendConfirmationEmail(regId);
      logActivity('email_sent', regId, 'Confirmation email sent via queue', 'EmailQueue');
    } catch (e) {
      console.error('processEmailQueue: failed for ' + regId + ': ' + e.toString());
      logActivity('error', regId, 'Email queue send failed: ' + e.toString(), 'EmailQueue');
      failed.push(regId);
    }
  }

  // Step 3: Re-queue any failed items; clean up triggers if queue is now empty
  try {
    lock.waitLock(10000);
    var remaining = [];
    try {
      remaining = JSON.parse(props.getProperty(EMAIL_QUEUE_KEY) || '[]');
    } catch (e) {
      remaining = [];
    }
    // Prepend failed items so they are retried first on the next run
    remaining = failed.concat(remaining);
    props.setProperty(EMAIL_QUEUE_KEY, JSON.stringify(remaining));

    if (remaining.length === 0) {
      // Queue fully drained — delete all processEmailQueue triggers
      _deleteEmailQueueTriggers();
    }
  } catch (e) {
    console.error('processEmailQueue: cleanup error: ' + e.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * Internal helper: deletes all time-based triggers for processEmailQueue.
 */
function _deleteEmailQueueTriggers() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processEmailQueue') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (e) {
    console.error('_deleteEmailQueueTriggers error: ' + e.toString());
  }
}
