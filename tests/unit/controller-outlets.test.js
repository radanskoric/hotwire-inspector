// @vitest-environment happy-dom

import { Application, Controller } from "@hotwired/stimulus";
import { afterEach, describe, expect, it } from "vitest";
import { extractControllerOutletDefinitions } from "../../lib/controller-outlets.js";

describe("extractControllerOutletDefinitions", () => {
  it("returns an empty list when the controller is missing", () => {
    expect(extractControllerOutletDefinitions(null)).toEqual([]);
    expect(extractControllerOutletDefinitions(undefined)).toEqual([]);
  });

  it("returns an empty list when the controller has no constructor", () => {
    expect(extractControllerOutletDefinitions({})).toEqual([]);
  });

  it("returns an empty list when constructor outlets is not an array", () => {
    const controller = { constructor: { outlets: "user-status" } };

    expect(extractControllerOutletDefinitions(controller)).toEqual([]);
  });

  it("returns an empty list when constructor outlets is missing", () => {
    const controller = { constructor: {} };

    expect(extractControllerOutletDefinitions(controller)).toEqual([]);
  });

  it("filters non-string outlet names from the constructor's outlets", () => {
    const controller = {
      constructor: { outlets: ["user-status", null, 42, "menu"] },
    };

    expect(extractControllerOutletDefinitions(controller)).toEqual([
      "user-status",
      "menu",
    ]);
  });

  it("returns the declared outlet names from the constructor", () => {
    const controller = {
      constructor: { outlets: ["user-status", "menu"] },
    };

    expect(extractControllerOutletDefinitions(controller)).toEqual([
      "user-status",
      "menu",
    ]);
  });
});

describe("with a real Stimulus application", () => {
  let application;

  afterEach(() => {
    application?.stop();
    document.body.innerHTML = "";
  });

  it("extracts outlets declared via `static outlets`", async () => {
    class UserStatusController extends Controller {}
    class MenuController extends Controller {}

    application = Application.start();
    application.register("user-status", UserStatusController);
    application.register("menu", MenuController);

    class HostController extends Controller {
      static outlets = ["user-status", "menu"];
    }

    application.register("host", HostController);

    document.body.innerHTML =
      '<div id="host" data-controller="host">' +
      '<div data-controller="user-status"></div>' +
      '<div data-controller="menu"></div>' +
      "</div>";

    await new Promise((resolve) => setTimeout(resolve, 0));

    const hostElement = document.getElementById("host");
    const controller = application.getControllerForElementAndIdentifier(
      hostElement,
      "host",
    );

    expect(extractControllerOutletDefinitions(controller)).toEqual([
      "user-status",
      "menu",
    ]);
  });

  it("returns an empty list when the controller class declares no outlets", async () => {
    class HostController extends Controller {}

    application = Application.start();
    application.register("host", HostController);

    document.body.innerHTML = '<div id="host" data-controller="host"></div>';
    await new Promise((resolve) => setTimeout(resolve, 0));

    const hostElement = document.getElementById("host");
    const controller = application.getControllerForElementAndIdentifier(
      hostElement,
      "host",
    );

    expect(extractControllerOutletDefinitions(controller)).toEqual([]);
  });
});
