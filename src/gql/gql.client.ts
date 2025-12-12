import { GraphQLClient } from "graphql-request";

export const gqlClient = new GraphQLClient(process.env.GRAPHQL_URL!, {
    headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN!}`
    },
});