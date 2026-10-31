/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as cycles from "../cycles.js";
import type * as github from "../github.js";
import type * as githubNode from "../githubNode.js";
import type * as http from "../http.js";
import type * as issues from "../issues.js";
import type * as labels from "../labels.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_keys from "../lib/keys.js";
import type * as model from "../model.js";
import type * as projects from "../projects.js";
import type * as users from "../users.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  auth: typeof auth;
  comments: typeof comments;
  cycles: typeof cycles;
  github: typeof github;
  githubNode: typeof githubNode;
  http: typeof http;
  issues: typeof issues;
  labels: typeof labels;
  "lib/access": typeof lib_access;
  "lib/activity": typeof lib_activity;
  "lib/functions": typeof lib_functions;
  "lib/keys": typeof lib_keys;
  model: typeof model;
  projects: typeof projects;
  users: typeof users;
  views: typeof views;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
