// Increase the process listener limit to suppress the MaxListenersExceededWarning
// that fires when many test files each import modules that register exit/signal handlers.
process.setMaxListeners(50);
