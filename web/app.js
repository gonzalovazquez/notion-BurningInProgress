require('dotenv').config();
const { CognitoIdentityProviderClient,
        AdminCreateUserCommand,
        AdminInitiateAuthCommand,
        AdminRespondToAuthChallengeCommand,
     } = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require('crypto');

const region = process.env.AWS_REGION;
const userPoolId = process.env.USER_POOL_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const newClientPassword = process.env.TEST_NEW_PASSWORD

// Create a Cognito Identity Provider Client
const client = new CognitoIdentityProviderClient({ region });

// Function to calculate SECRET_HASH
function calculateSecretHash(username) {
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(username + clientId);
    return hmac.digest('base64');
}


// Sign up a new user
async function signUpUser(username, password, email) {
    const params = {
        UserPoolId: userPoolId,
        Username: username,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [
            {
                Name: "email",
                Value: email,
            },
        ],
        TemporaryPassword: password,
    };

    try {
        const data = await client.send(new AdminCreateUserCommand(params));
        console.log("User created successfully");
        return data;
    } catch (err) {
        console.error("Error signing up user:", err);
        throw err;
    }
}

// Sign in an existing user and retrieve a token
async function signInUser(username, password) {
    try {
        const secretHash = calculateSecretHash(username);

        const params = {
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            ClientId: clientId,
            UserPoolId: userPoolId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
                SECRET_HASH: secretHash,
            },
        };

        console.log("Initiating authentication...");
        const initiateAuthResponse = await client.send(new AdminInitiateAuthCommand(params));
        console.log("Authentication initiated");
        console.log(initiateAuthResponse)

        if (initiateAuthResponse.Session) {
            const session = initiateAuthResponse.Session;

            const challengeParams = {
                ChallengeName: "NEW_PASSWORD_REQUIRED",
                ClientId: clientId,
                UserPoolId: userPoolId,
                Session: session,
                ChallengeResponses: {
                    USERNAME: username,
                    SECRET_HASH: secretHash,
                    NEW_PASSWORD: newClientPassword,
                },
            };

            const respondToChallengeResponse = await client.send(
                new AdminRespondToAuthChallengeCommand(challengeParams)
            );

            console.log("Challenge completed successfully");

            if (respondToChallengeResponse.AuthenticationResult?.IdToken) {
                return respondToChallengeResponse.AuthenticationResult.IdToken;
            }
            throw new Error("No token received after challenge");
        }

        if (initiateAuthResponse.AuthenticationResult?.IdToken) {
            return initiateAuthResponse.AuthenticationResult.IdToken;
        }

        throw new Error("Authentication failed - no token received");
    } catch (err) {
        console.error("Error signing in:", err);
        throw err;
    }
}

// Example usage with environment variables
async function main() {
    try {
        // Sign up example (commented out for safety)
        // await signUpUser(process.env.TEST_USERNAME, process.env.TEST_PASSWORD, process.env.TEST_EMAIL);

        const jwtToken = await signInUser(process.env.TEST_USERNAME, process.env.TEST_NEW_PASSWORD);
        console.log("Authentication successful");
        console.log(jwtToken)
        return jwtToken;
    } catch (error) {
        console.error("Authentication failed:", error.message);
        throw error;
    }
}

// Only run if this is the main module
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    signUpUser,
    signInUser
};