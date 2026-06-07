// frontend/src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState(null);
    const [school, setSchool] = useState(null);

    useEffect(() => {
        // Check if user is logged in
        const token = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');
        
        // Check for school in localStorage (matches your api.js structure)
        const savedSchool = localStorage.getItem('selectedSchool');
        if (savedSchool) {
            try {
                const schoolData = JSON.parse(savedSchool);
                setSchool(schoolData);
                setSchoolId(schoolData.id);
            } catch (e) {
                console.error('Error parsing school:', e);
            }
        }
        
        if (token) {
            setUser({ token, refreshToken });
            // Set default auth header
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const response = await api.post('/token/', { email, password });
            const { access, refresh } = response.data;
            
            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);
            api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
            
            // Fetch user profile to get school info
            try {
                const profileResponse = await api.get('/users/me/');
                if (profileResponse.data && profileResponse.data.school) {
                    const schoolData = profileResponse.data.school;
                    localStorage.setItem('selectedSchool', JSON.stringify(schoolData));
                    setSchool(schoolData);
                    setSchoolId(schoolData.id);
                }
            } catch (profileError) {
                console.error('Error fetching profile:', profileError);
            }
            
            setUser({ token: access, refresh });
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { 
                success: false, 
                error: error.response?.data?.detail || error.response?.data?.message || 'Login failed' 
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        // Don't remove selectedSchool - keep for next login
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        // Keep school data for potential re-login
    };

    const switchSchool = (schoolData) => {
        localStorage.setItem('selectedSchool', JSON.stringify(schoolData));
        setSchool(schoolData);
        setSchoolId(schoolData.id);
        // Reload page to refresh all data with new school
        window.location.reload();
    };

    const getAuthHeader = () => {
        const token = localStorage.getItem('access_token');
        const savedSchool = localStorage.getItem('selectedSchool');
        let currentSchoolId = schoolId;
        
        if (savedSchool && !currentSchoolId) {
            try {
                const school = JSON.parse(savedSchool);
                currentSchoolId = school.id;
            } catch (e) {}
        }
        
        return {
            'Authorization': token ? `Bearer ${token}` : '',
            'X-School-ID': currentSchoolId || ''
        };
    };

    const value = {
        user,
        loading,
        schoolId,
        school,
        login,
        logout,
        switchSchool,
        getAuthHeader,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;