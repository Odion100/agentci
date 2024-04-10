// Import the EventEmitter class
import EventEmitter from "events";

// Create EventEmitter instance
const myEmitter = new EventEmitter();

// Event listener
myEmitter.on("event", (arg1, arg2) => {
  console.log("Event occurred with arguments:", arg1, arg2);
});

// Emit the event
myEmitter.emit("event", "Hello", "World");
