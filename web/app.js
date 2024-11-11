require('dotenv').config();
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminInitiateAuthCommand, AdminRespondToAuthChallengeCommand } = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require('crypto');

const region = process.env.AWS_REGION;
const userPoolId = process.env.USER_POOL_ID;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

// Create a Cognito Identity Provider Client
const client = new CognitoIdentityProviderClient({ region });

// Function to get correctly formatted timestamp
function getFormattedTimestamp(date = new Date()) {
    // Day of week (EEE)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = days[date.getDay()];
    
    // Month (MMM)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    
    // Day of month (d)
    const dayOfMonth = date.getDate();
    
    // Hours, minutes, seconds (HH:mm:ss)
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // Timezone (z)
    const timezone = 'GMT';
    
    // Year (yyyy)
    const year = date.getFullYear();
    
    return `${dayOfWeek} ${month} ${dayOfMonth} ${hours}:${minutes}:${seconds} ${timezone} ${year}`;
}

// Function to calculate SECRET_HASH
function calculateSecretHash(username) {
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(username + clientId);
    return hmac.digest('base64');
}

async function calculatePasswordClaimSignature(username, password, timestamp) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256');
    const message = Buffer.from(username + timestamp);
    const signature = crypto.createHmac('sha256', key).update(message).digest();
    
    return {
        passwordClaimSignature: signature.toString('base64'),
        salt: salt.toString('base64')
    };
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
        const timestamp = getFormattedTimestamp();
        const secretHash = calculateSecretHash(username);
        const { passwordClaimSignature, salt } = await calculatePasswordClaimSignature(
            username,
            password,
            timestamp
        );

        const params = {
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            ClientId: clientId,
            UserPoolId: userPoolId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
                SECRET_HASH: secretHash,
                TIMESTAMP: timestamp,
                PASSWORD_CLAIM_SIGNATURE: passwordClaimSignature,
                PASSWORD_CLAIM_SECRET_BLOCK: salt
            },
        };

        console.log("Initiating authentication...");
        console.log("Using timestamp:", timestamp); // Debug log
        const initiateAuthResponse = await client.send(new AdminInitiateAuthCommand(params));
        console.log("Authentication initiated");

        if (initiateAuthResponse.Session) {
            const session = initiateAuthResponse.Session;
            
            const challengeParams = {
                ChallengeName: "PASSWORD_VERIFIER",
                ClientId: clientId,
                UserPoolId: userPoolId,
                Session: session,
                ChallengeResponses: {
                    USERNAME: username,
                    PASSWORD: password,
                    SECRET_HASH: secretHash,
                    TIMESTAMP: timestamp,
                    PASSWORD_CLAIM_SIGNATURE: passwordClaimSignature,
                    PASSWORD_CLAIM_SECRET_BLOCK: salt
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

        const jwtToken = await signInUser(process.env.TEST_USERNAME, process.env.TEST_PASSWORD);
        console.log("Authentication successful");
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