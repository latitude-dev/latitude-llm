import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { T as Text2, B as Button, l as TableWithHeader, u as useToast, b as Input, n as Table, o as TableHeader, p as TableRow, q as TableHead, r as TableBody, s as TableCell, I as Icon, Z as Tooltip, t as getQueryClient } from "./router-DWBQ1rk2.mjs";
import { C as Container } from "./container-CyYjdg0j.mjs";
import { F as FormWrapper } from "./form-wrapper-D9-NFgN4.mjs";
import { M as Modal, C as CloseTrigger } from "./modal-B5gjEbyd.mjs";
import { T as TableSkeleton } from "./table-skeleton-D2NW79t6.mjs";
import { r as relativeTime } from "./relativeTime-CCHfweVn.mjs";
import { u as useForm } from "../_libs/tanstack__react-form.mjs";
import { q as queryCollectionOptions } from "../_libs/tanstack__query-db-collection.mjs";
import { u as useLiveQuery } from "../_libs/tanstack__react-db.mjs";
import { e as errorHandler, c as createSsrRpc } from "./middlewares-BgvwNBR1.mjs";
import { e as createServerFn } from "./index.mjs";
import { a as authClient, W as WEB_BASE_URL } from "./auth-client-eZt5gsJf.mjs";
import { k as Trash2, g as Clipboard, l as Pencil } from "../_libs/lucide-react.mjs";
import { a as createCollection } from "../_libs/tanstack__db.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
import "../_libs/papaparse.mjs";
import "stream";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tiny-invariant.mjs";
import "../_libs/tanstack__history.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/tiny-warning.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "../_libs/isbot.mjs";
import "./index-D2KejSDZ.mjs";
import "events";
import "dns";
import "fs";
import "net";
import "tls";
import "path";
import "string_decoder";
import "http";
import "https";
import "child_process";
import "assert";
import "url";
import "tty";
import "buffer";
import "zlib";
import "node:os";
import "os";
import "node:crypto";
import "path/posix";
import "node:util";
import "fs/promises";
import "node:fs/promises";
import "node:process";
import "node:path";
import "node:fs";
import "node:zlib";
import "../_libs/effect.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "node:async_hooks";
import "../_libs/tanstack__form-core.mjs";
import "../_libs/tanstack__store.mjs";
import "../_libs/tanstack__pacer-lite.mjs";
import "../_libs/@tanstack/devtools-event-client+[...].mjs";
import "../_libs/tanstack__react-store.mjs";
import "../_libs/use-sync-external-store.mjs";
import "../_libs/tanstack__db-ivm.mjs";
import "../_libs/fractional-indexing.mjs";
const listApiKeys = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(createSsrRpc("2e1b4735ef716426df50dc62b0d9c1b625f6ef78334657f9d45dfe3a2977de0c"));
const createApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  name: string().min(1).max(256)
})).handler(createSsrRpc("7221641cbfad588c19e3338bdfe8a4c61bc64b311d7611fb709444d45e5085db"));
const updateApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string(),
  name: string().min(1).max(256)
})).handler(createSsrRpc("cec34d02d95198ada3ced59284a79a79270cec8fec546c22736dd2b9c4f5a9ab"));
const deleteApiKey = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  id: string()
})).handler(createSsrRpc("230ad095ab98d151103d002bac87db923fc5032f516eb1da3aa293bb305d4b06"));
const queryClient$1 = getQueryClient();
const apiKeysCollection = createCollection(
  queryCollectionOptions({
    queryClient: queryClient$1,
    queryKey: ["apiKeys"],
    queryFn: () => listApiKeys(),
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => createApiKey({
            data: {
              name: mutation.modified.name ?? "API Key"
            }
          })
        )
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => updateApiKey({
            data: {
              id: mutation.key,
              name: mutation.modified.name ?? "API Key"
            }
          })
        )
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => deleteApiKey({
            data: {
              id: mutation.key
            }
          })
        )
      );
    }
  })
);
function invalidateApiKeys() {
  void queryClient$1.invalidateQueries({ queryKey: ["apiKeys"] });
}
const useApiKeysCollection = () => {
  return useLiveQuery((query) => query.from({ apiKey: apiKeysCollection }));
};
const listMembers = createServerFn({
  method: "GET"
}).middleware([errorHandler]).handler(createSsrRpc("42831df04e5311fa652910c2af55be21ffc637db53181303241a8fff26651d73"));
const inviteMember = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  email: string().email()
})).handler(createSsrRpc("a7670072bda92e63ba64a1dce3f9fb1ba785d258e1a002f7bd8aca6cd839f03e"));
const removeMember = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  membershipId: string()
})).handler(createSsrRpc("51b48db34bcbd58da98db47954818e84e9e500ce3b962054353ee9ff895799b2"));
const queryClient = getQueryClient();
const membersCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["members"],
    queryFn: () => listMembers(),
    getKey: (item) => item.id,
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(
          (mutation) => removeMember({
            data: {
              membershipId: mutation.key
            }
          })
        )
      );
    }
  })
);
function invalidateMembers() {
  void queryClient.invalidateQueries({ queryKey: ["members"] });
}
const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }));
};
function InviteMemberModal({
  open,
  setOpen
}) {
  const {
    toast
  } = useToast();
  const form = useForm({
    defaultValues: {
      email: ""
    },
    onSubmit: async ({
      value
    }) => {
      const {
        intentId
      } = await inviteMember({
        data: {
          email: value.email
        }
      });
      const {
        error
      } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL: `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}`
      });
      if (error) {
        throw new Error(error.message ?? "Failed to send invitation email");
      }
      toast({
        description: "Invitation sent"
      });
      invalidateMembers();
      setOpen(false);
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Modal, { dismissible: true, open, onOpenChange: setOpen, title: "Add New Member", description: "Invite a new member to this workspace by email.", footer: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CloseTrigger, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", onClick: () => {
      void form.handleSubmit();
    }, children: "Send invite" })
  ] }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e) => {
    e.preventDefault();
    void form.handleSubmit();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormWrapper, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "email", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, type: "email", label: "Email", value: field.state.value, onChange: (e) => field.handleChange(e.target.value), placeholder: "jon@latitude.so" }) }) }) }) });
}
function MembersTable({
  members
}) {
  const {
    toast
  } = useToast();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Email" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Confirmed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, {})
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: members.map((member) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, hoverable: false, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: member.name ?? "-" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: member.email }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: member.status === "invited" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "warningMutedForeground", children: "Invited" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: relativeTime(member.confirmedAt) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { align: "right", children: member.status === "active" && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, variant: "ghost", onClick: () => {
        void removeMember({
          data: {
            membershipId: member.id
          }
        }).then(() => {
          invalidateMembers();
          toast({
            description: "Member removed"
          });
        }).catch((e) => toast({
          variant: "destructive",
          description: JSON.parse(e.message).message
        }));
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Trash2, size: "sm" }) }) })
    ] }, member.id)) })
  ] });
}
function MembershipsSection() {
  const [inviteOpen, setInviteOpen] = reactExports.useState(false);
  const {
    data,
    isLoading
  } = useMembersCollection();
  const members = data ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(InviteMemberModal, { open: inviteOpen, setOpen: setInviteOpen }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { weight: "bold", children: "Workspace Members" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setInviteOpen(true), children: "Add Member" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
      isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 4, rows: 3 }),
      !isLoading && members.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(MembersTable, { members })
    ] })
  ] });
}
function CreateApiKeyModal({
  open,
  setOpen
}) {
  const form = useForm({
    defaultValues: {
      name: ""
    },
    onSubmit: async ({
      value
    }) => {
      await createApiKey({
        data: {
          name: value.name
        }
      });
      invalidateApiKeys();
      setOpen(false);
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Modal, { dismissible: true, open, onOpenChange: setOpen, title: "Create API Key", description: "Create a new API key for your workspace to access the Latitude API.", footer: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CloseTrigger, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", onClick: () => {
      void form.handleSubmit();
    }, children: "Create API Key" })
  ] }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e) => {
    e.preventDefault();
    void form.handleSubmit();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormWrapper, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "name", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, type: "text", label: "Name", value: field.state.value, onChange: (e) => field.handleChange(e.target.value), placeholder: "My API Key", description: "A descriptive name for this API key" }) }) }) }) });
}
function UpdateApiKeyModal({
  apiKey,
  onClose
}) {
  const {
    toast
  } = useToast();
  const form = useForm({
    defaultValues: {
      name: apiKey.name ?? ""
    },
    onSubmit: async ({
      value
    }) => {
      await updateApiKey({
        data: {
          id: apiKey.id,
          name: value.name
        }
      });
      invalidateApiKeys();
      toast({
        title: "Success",
        description: "API key name updated."
      });
      onClose();
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Modal, { open: true, dismissible: true, onOpenChange: onClose, title: "Update API Key", description: "Update the name for your API key.", footer: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CloseTrigger, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", onClick: () => {
      void form.handleSubmit();
    }, children: "Update API Key" })
  ] }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: (e) => {
    e.preventDefault();
    void form.handleSubmit();
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(FormWrapper, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(form.Field, { name: "name", children: (field) => /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { required: true, type: "text", label: "Name", value: field.state.value, onChange: (e) => field.handleChange(e.target.value), placeholder: "API key name" }) }) }) }) });
}
function ApiKeysTable({
  apiKeys
}) {
  const {
    toast
  } = useToast();
  const [apiKeyToEdit, setApiKeyToEdit] = reactExports.useState(null);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Table, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, { children: "API Key" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableHead, {})
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TableBody, { children: apiKeys.map((apiKey) => /* @__PURE__ */ jsxRuntimeExports.jsxs(TableRow, { verticalPadding: true, hoverable: false, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { children: apiKey.name || "Latitude API Key" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { asChild: true, trigger: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, variant: "ghost", onClick: () => {
          navigator.clipboard.writeText(apiKey.token);
          toast({
            title: "Copied to clipboard"
          });
        }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H5, { color: "foregroundMuted", children: apiKey.token.length > 7 ? `${apiKey.token.slice(0, 3)}********${apiKey.token.slice(-4)}` : "********" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Clipboard, size: "sm", color: "foregroundMuted" })
        ] }) }), children: "Click to copy" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TableCell, { align: "right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-row items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { asChild: true, trigger: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, variant: "ghost", onClick: () => setApiKeyToEdit(apiKey), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Pencil, size: "sm" }) }), children: "Edit API key name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Tooltip, { asChild: true, trigger: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { flat: true, disabled: apiKeys.length === 1, variant: "ghost", onClick: () => {
            void deleteApiKey({
              data: {
                id: apiKey.id
              }
            }).then(() => {
              invalidateApiKeys();
            });
          }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { icon: Trash2, size: "sm" }) }), children: apiKeys.length === 1 ? "You can't delete the last API key" : "Delete API key" })
        ] }) })
      ] }, apiKey.id)) })
    ] }),
    apiKeyToEdit && /* @__PURE__ */ jsxRuntimeExports.jsx(UpdateApiKeyModal, { apiKey: apiKeyToEdit, onClose: () => setApiKeyToEdit(null) })
  ] });
}
function ApiKeysSection() {
  const [createOpen, setCreateOpen] = reactExports.useState(false);
  const {
    data,
    isLoading
  } = useApiKeysCollection();
  const apiKeys = data ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(CreateApiKeyModal, { open: createOpen, setOpen: setCreateOpen }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TableWithHeader, { title: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-row items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Text2.H4, { weight: "bold", children: "API Keys" }) }), actions: /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setCreateOpen(true), children: "Create API Key" }), table: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(TableSkeleton, { cols: 3, rows: 3 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ApiKeysTable, { apiKeys }) })
  ] });
}
function SettingsPage() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Container, { className: "pt-14", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(MembershipsSection, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ApiKeysSection, {})
  ] });
}
export {
  SettingsPage as component
};
