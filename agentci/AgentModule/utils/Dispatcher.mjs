import EventEmitter from "events";

export default function Dispatcher(internalContext) {
  const eventEmitter = new EventEmitter();
  const dispatcher = {};
  dispatcher.emit = () => {};
  return dispatcher;
}
