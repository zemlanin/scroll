const test = require("tape");
const mockery = require("mockery");

if (typeof test.Test.prototype.mockery === "undefined") {
  mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false,
  });

  test.onFinish(() => {
    mockery.disable();
  });

  test.Test.prototype.mockery = function tapeMockery(moduleName, mock) {
    mockery.registerMock(moduleName, mock);

    this.teardown(() => {
      mockery.deregisterMock(moduleName);
    });
  };
}
