"use server";

import { redirect } from "react-router";

export async function redirectAction(formData: FormData) {
  throw redirect("/?redirected=true");
}
