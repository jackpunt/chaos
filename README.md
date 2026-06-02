# Chaos

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

still using webpack because [vite sourcemap problem](https://stackoverflow.com/questions/76750947/vite-dev-server-sourcemaps-dont-work-or-point-to-wrong-lines-files-in-vscode-de/79458228#79458228)

[vite bug 15047](https://github.com/vitejs/vite/issues/15047) closed as not reproduced

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.


## Hack

Gemini offered this usage of new Proxy() to add behavior of two unrelated instances.
For each method 'this' is bound, so instances cannot access each other's state or methods.
We used the prototype copy instead (to merge the hexMap to each CardPanel)

```
/**
 * A Proxy instance that works like instanceA but will delegate unknown methods/fields to instanceB.
 * @param instanceA
 * @param instanceB
 * @returns
 */
function createDualProxy<T extends object, U extends object>(instanceA: T, instanceB: U): T & U {
  return new Proxy(instanceA, {
    get(target, prop, receiver) {
      // 1. If the property exists on InstanceA, use it
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        // Ensure methods remain bound to instanceA
        return typeof value === 'function' ? value.bind(target) : value;
      }

      // 2. Otherwise, fall back and look it up on InstanceB
      if (prop in instanceB) {
        const value = Reflect.get(instanceB, prop);
        // Ensure methods from ClassB execute with instanceB's context
        return typeof value === 'function' ? value.bind(instanceB) : value;
      }

      return undefined;
    },
    has(target, prop) {
      // Correctly reports 'true' for 'in' operator checks on both classes
      return prop in target || prop in instanceB;
    }
  }) as T & U;
}
```
