# Chaos

## Explainer

[Choas Order](https://docs.google.com/document/d/1233l5BVtKD-KcAcVPqyA4bgy-h6HGWJapEH6uSzNb4E/) Google Docs


This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4215/`. The application will automatically reload whenever you modify any of the source files.

Tell angular.json to use: architect.build.defaultConfiguration: "development"

That gets optimization: "false" so vite will not rewrite & break the sourcemap.


## Hack - multiple inheritance

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

That didn't work so we derived mixins.clonePrototypChain() and use it in gameSetup.ts:
```
  static {
    // insert methods of HexMap2: Panel extends HexMap2 & PlayerPanel {...}
    const bOverA1 = mixins.clonePrototypeChain(HexMap2, PlayerPanel.prototype);
    Object.setPrototypeOf(Panel.prototype, bOverA1);   // now Panel ISA HexMap2 & PlayerPanel
  }
  ```
