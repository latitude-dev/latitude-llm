# Annotation UI Identification

Read @specs/realibity.md and @docs/annotations.md and @docs/annotation-queues.md to understand the context of this document.

I want to achive these goals in this PRD:

## (1) What to show in an Annottation UI
Now we show avatar + name when `score.annotatorId` is present. But I want you to
make in @domain/annoations different methods to know when an annotation is done
from our system annotions, that will be an `agent` or make in `apps/api` by the
users. That would be `api`. So I want to have in the domain a
`getAnnotationProcedence` that returns fully typed `human`, `agent` or `api`.
And with that in the annotation UI where we now show avatar + name show for
`agent` Latitude logo as avatar + Latitude + badge (agent) and for `api` show
only API badge in the human case is self explanatory. but in the other cases add
a tooltip with the procedence of the annotation on the header of the annotation.

## (2) When and when not is allowed to update an annotation.
After reading the documents specify in this PRD all the rules, review current UI
and backend to make sure is editable only in that cases. Again add methods if
not present to respond to `canUpdateAnnotation`.

## (3) Update seed data.
For the seed data I want to produce in the same trace these things.
The traces id is the cuid with `1111...`
- 3 annotation from an agent
- 2 annotation from the API
- 4 annotation from a human

These annotations has to be of the 3 types.
- Under message
- Under tool call
- Global annotation
- Text range selection

Also make this trace to be long. To have many messages so we can play in the UI
with the scroll and see the different annotations.

## (4) Change annotation queue list
We don't want to allow to edit system annotations anything other than assignees.
Also we don't want to allow delete system annaotions. Show disable the option in
the list and in the details of the annotation queue show a `<Alert >` info
explaining that system annotations are managed by Latitude and can't be deleted or edited but you can always add a new annotation to the queue if you want to add more context or information.

## (5) Implement Approve and Reject for system annotations
System queues produce annotations. These annoations you have to double check are
created in draft. If they are created in draft, then you have to implement the approve and reject buttons in the annoation UI. Also implement the backend functions and the use case. Make sure to understand what implies that the user approve (publish the annotation). Reject means delete the annotation.
